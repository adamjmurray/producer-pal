// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The Installation tab's remote script section against a stubbed /remote-script
// endpoint. The install itself is a Node-side file copy, so what's worth
// guarding here is the flow: what the tab shows before, during, and after the
// POST.

import { type Page, expect, test } from "@playwright/test";
import { installStubs } from "../ui-test-helpers";
import {
  type InstallStub,
  openInstallationTab,
  loadSettings,
  stubStatusAndInstall,
} from "./settings-test-helpers";

const USER_LIBRARY = "/Users/me/Music/Ableton/User Library";

/** The `GET /remote-script` body. */
interface RemoteScriptStatus {
  userLibrary: string | null;
  installed: boolean;
  installedVersion: string | null;
  bundledVersion: string;
  running: boolean;
  runningVersion: string | null;
  liveVersion: string | null;
  otherOnPort: number | null;
  updateAvailable: boolean;
  installedNewer: boolean;
}

/**
 * A not-installed status with a User Library detected.
 * @param overrides - Fields to change
 * @returns The status body
 */
function status(
  overrides: Partial<RemoteScriptStatus> = {},
): RemoteScriptStatus {
  return {
    userLibrary: USER_LIBRARY,
    installed: false,
    installedVersion: null,
    bundledVersion: "1.2.0",
    running: false,
    runningVersion: null,
    liveVersion: "12.1",
    otherOnPort: null,
    updateAvailable: false,
    installedNewer: false,
    ...overrides,
  };
}

/**
 * Stub both remote-script endpoints.
 * @param page - Playwright page
 * @param initial - What the first status read returns
 * @param install - How the install POST answers
 */
async function stubRemoteScript(
  page: Page,
  initial: RemoteScriptStatus,
  install: InstallStub<RemoteScriptStatus>,
): Promise<void> {
  await stubStatusAndInstall(page, "remote-script", initial, install);
}

/**
 * Stub a script installed and running at v1.1.0, which the install updates to
 * this build's v1.2.0.
 * @param page - Playwright page
 */
async function stubUpdateAvailable(page: Page): Promise<void> {
  await stubRemoteScript(
    page,
    status({
      installed: true,
      installedVersion: "1.1.0",
      running: true,
      runningVersion: "1.1.0",
      updateAvailable: true,
    }),
    {
      status: 200,
      body: {
        path: `${USER_LIBRARY}/Remote Scripts/Producer_Pal`,
        version: "1.2.0",
      },
      after: { installedVersion: "1.2.0", updateAvailable: false },
    },
  );
}

test.describe("Settings — installation: remote script (stubbed backend)", () => {
  test("installs from the detected User Library and shows the steps", async ({
    page,
  }) => {
    await installStubs(page);
    await stubRemoteScript(page, status(), {
      status: 200,
      body: {
        path: `${USER_LIBRARY}/Remote Scripts/Producer_Pal`,
        version: "1.2.0",
      },
      after: { installed: true, installedVersion: "1.2.0" },
    });
    await loadSettings(page);
    await openInstallationTab(page);

    await expect(page.getByTestId("remote-script-status")).toHaveText(
      "Not installed",
    );
    await expect(page.getByTestId("user-library-path")).toHaveValue(
      USER_LIBRARY,
    );
    await expect(page.getByTestId("remote-script-steps")).toBeHidden();

    await page.getByTestId("remote-script-install").click();

    await expect(
      page.getByTestId("remote-script-installed-path"),
    ).toContainText("Producer_Pal");
    await expect(page.getByTestId("remote-script-status")).toHaveText(
      "Installed v1.2.0 (not running)",
    );
    // Expanded, because Live still has to be restarted and pointed at it.
    await expect(page.getByTestId("remote-script-steps")).toContainText(
      "Restart Live",
    );
  });

  test("offers Update when this build ships a newer version", async ({
    page,
  }) => {
    await installStubs(page);
    await stubUpdateAvailable(page);
    await loadSettings(page);
    await openInstallationTab(page);

    await expect(page.getByTestId("remote-script-status")).toHaveText(
      "Update available: installed v1.1.0, this build has v1.2.0 (running v1.1.0 in Live 12.1)",
    );

    await page.getByTestId("remote-script-install").click();

    await expect(page.getByTestId("remote-script-status")).toHaveText(
      "Installed v1.2.0 (running v1.1.0 in Live 12.1)",
    );
    // Live is still running the old copy, so the steps reopen with the restart.
    await expect(page.getByTestId("remote-script-restart")).toHaveText(
      "Restart Live to load v1.2.0.",
    );
    // Expanded as its own section, not the collapsed "Setup steps".
    await expect(page.getByTestId("remote-script-steps")).toContainText(
      "Enable it in Live",
    );
  });

  test("says another program answers on the port when the script is installed but not running", async ({
    page,
  }) => {
    await installStubs(page);
    await stubRemoteScript(
      page,
      status({ installed: true, installedVersion: "1.2.0", otherOnPort: 3349 }),
      { status: 200, body: {} },
    );
    await loadSettings(page);
    await openInstallationTab(page);

    await expect(page.getByTestId("remote-script-status")).toHaveText(
      "Installed v1.2.0 (not running; another program answers on port 3349)",
    );
  });

  test("takes a pasted path when no User Library was detected", async ({
    page,
  }) => {
    await installStubs(page);
    await stubRemoteScript(page, status({ userLibrary: null }), {
      status: 400,
      body: { error: "No such directory: /nope" },
    });
    await loadSettings(page);
    await openInstallationTab(page);

    await expect(page.getByTestId("user-library-path")).toHaveValue("");
    await expect(page.getByTestId("remote-script-install")).toBeDisabled();
    await expect(page.getByTestId("installation-tab")).toContainText(
      "Location of User Library",
    );

    await page.getByTestId("user-library-path").fill("/nope");
    await page.getByTestId("remote-script-install").click();

    await expect(page.getByTestId("remote-script-error")).toHaveText(
      "No such directory: /nope",
    );
  });

  test("flags an update in the header, opens the tab, and follows the install", async ({
    page,
  }) => {
    await installStubs(page);
    await stubUpdateAvailable(page);
    await page.goto("/chat-ui.html");

    await page.getByRole("button", { name: "(script update)" }).click();

    // The badge opens Settings on the Installation tab.
    await expect(page.getByTestId("remote-script-status")).toBeVisible();

    await page.getByTestId("remote-script-install").click();

    // Updated but not yet loaded by Live: the badge asks for a restart.
    await expect(
      page.getByRole("button", { name: "(restart Live)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "(script update)" }),
    ).toBeHidden();
  });

  test("shows no header badge when the script is current", async ({ page }) => {
    await installStubs(page);
    await stubRemoteScript(
      page,
      status({
        installed: true,
        installedVersion: "1.2.0",
        running: true,
        runningVersion: "1.2.0",
      }),
      { status: 200, body: {} },
    );
    await page.goto("/chat-ui.html");

    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "(script update)" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "(restart Live)" }),
    ).toBeHidden();
  });
});
