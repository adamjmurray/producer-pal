// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The Remote Script tab against a stubbed /remote-script endpoint. The install
// itself is a Node-side file copy, so what's worth guarding here is the flow:
// what the tab shows before, during, and after the POST.

import { type Page, expect, test } from "@playwright/test";
import {
  openRemoteScriptTab,
  setupSettingsTest,
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
  updateAvailable: boolean;
}

/** How the stubbed install answers, and what it does to the status after. */
interface InstallStub {
  status: number;
  body: unknown;
  /** Status fields the install changes, applied on a 200. */
  after?: Partial<RemoteScriptStatus>;
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
    updateAvailable: false,
    ...overrides,
  };
}

/**
 * Stub both remote-script endpoints. A successful install rewrites the status
 * the next read answers with, the way the real server would.
 * @param page - Playwright page
 * @param initial - What the first status read returns
 * @param install - How the install POST answers
 */
async function stubRemoteScript(
  page: Page,
  initial: RemoteScriptStatus,
  install: InstallStub,
): Promise<void> {
  let current = initial;

  await page.route("**/remote-script", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(current),
    }),
  );

  await page.route("**/remote-script/install", (route) => {
    if (install.status === 200) {
      current = { ...current, ...install.after };
    }

    return route.fulfill({
      status: install.status,
      contentType: "application/json",
      body: JSON.stringify(install.body),
    });
  });
}

test.describe("Settings — remote script (stubbed backend)", () => {
  test("installs from the detected User Library and shows the steps", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await stubRemoteScript(page, status(), {
      status: 200,
      body: {
        path: `${USER_LIBRARY}/Remote Scripts/Producer_Pal`,
        version: "1.2.0",
      },
      after: { installed: true, installedVersion: "1.2.0" },
    });
    await openRemoteScriptTab(page);

    await expect(page.getByTestId("remote-script-status")).toHaveText(
      "Not installed",
    );
    await expect(page.getByTestId("remote-script-path")).toHaveValue(
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
    await setupSettingsTest(page);
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
    await openRemoteScriptTab(page);

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
    await expect(page.getByTestId("remote-script-steps")).toHaveAttribute(
      "open",
      "",
    );
  });

  test("takes a pasted path when no User Library was detected", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await stubRemoteScript(page, status({ userLibrary: null }), {
      status: 400,
      body: { error: "No such directory: /nope" },
    });
    await openRemoteScriptTab(page);

    await expect(page.getByTestId("remote-script-path")).toHaveValue("");
    await expect(page.getByTestId("remote-script-install")).toBeDisabled();
    await expect(page.getByTestId("remote-script-tab")).toContainText(
      "Location of User Library",
    );

    await page.getByTestId("remote-script-path").fill("/nope");
    await page.getByTestId("remote-script-install").click();

    await expect(page.getByTestId("remote-script-error")).toHaveText(
      "No such directory: /nope",
    );
  });
});
