// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The Installation tab's device section against stubbed /device-install
// endpoints, and the `?settings=installation` link the device's "Finish
// installation" button opens. The copy itself is a Node-side file operation, so
// what's worth guarding here is the flow: what the tab offers, what it sends,
// and what it shows after.

import { type Page, expect, test } from "@playwright/test";
import { installStubs } from "../ui-test-helpers";
import {
  openInstallationTab,
  setupSettingsTest,
} from "./settings-test-helpers";

const USER_LIBRARY = "/Users/me/Music/Ableton/User Library";
const DEVICE_PATH = `${USER_LIBRARY}/Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd`;

/** The `GET /device-install` body. */
interface DeviceStatus {
  source: string | null;
  problem: string | null;
  userLibrary: string | null;
  path: string | null;
  state: string | null;
  version: string;
  installedVersion: string | null;
  otherCopies: string[];
  inUserLibrary: boolean;
  swap: { allowed: boolean; reason: string | null };
}

/**
 * A frozen device with no copy in the User Library.
 * @param overrides - Fields to change
 * @returns The status body
 */
function status(overrides: Partial<DeviceStatus> = {}): DeviceStatus {
  return {
    source: "/Users/me/Downloads/Producer_Pal.amxd",
    problem: null,
    userLibrary: USER_LIBRARY,
    path: DEVICE_PATH,
    inUserLibrary: false,
    state: "not-installed",
    version: "1.2.0",
    installedVersion: null,
    otherCopies: [],
    swap: {
      allowed: false,
      reason:
        "There is no copy of this device in your User Library yet. Install it first.",
    },
    ...overrides,
  };
}

/**
 * Stub both device-install endpoints. A successful install rewrites the status
 * the next read answers with, as the real server would.
 * @param page - Playwright page
 * @param initial - What the first status read returns
 * @param install - How the install POST answers
 * @param install.status - HTTP status of the answer
 * @param install.body - JSON body of the answer
 * @param install.after - Status fields the install changes, applied on a 200
 * @returns The bodies the install POST received
 */
async function stubDevice(
  page: Page,
  initial: DeviceStatus,
  install: {
    status: number;
    body: unknown;
    after?: Partial<DeviceStatus>;
  } = { status: 200, body: {} },
): Promise<unknown[]> {
  let current = initial;
  const posted: unknown[] = [];

  await page.route("**/device-install", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(current),
    }),
  );
  await page.route("**/device-install/install", (route) => {
    posted.push(route.request().postDataJSON());

    if (install.status === 200) {
      current = { ...current, ...install.after };
    }

    return route.fulfill({
      status: install.status,
      contentType: "application/json",
      body: JSON.stringify(install.body),
    });
  });

  return posted;
}

test.describe("Settings — installation: device (stubbed backend)", () => {
  test("installs this device into the detected User Library", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    const posted = await stubDevice(page, status(), {
      status: 200,
      body: {
        outcome: "installed",
        path: DEVICE_PATH,
        detail: "Installed the device.",
      },
      after: { state: "same", installedVersion: "1.2.0" },
    });

    await openInstallationTab(page);

    await expect(page.getByTestId("device-status")).toHaveText(
      "Not in your User Library",
    );
    // The one path field at the top serves both sections.
    await expect(page.getByTestId("user-library-path")).toHaveValue(
      USER_LIBRARY,
    );

    await page.getByTestId("device-install").click();

    await expect(page.getByTestId("device-installed-path")).toHaveText(
      `Installed the device. (${DEVICE_PATH})`,
    );
    await expect(page.getByTestId("device-status")).toHaveText(
      "The copy in your User Library is this device (v1.2.0)",
    );
    await expect(page.getByTestId("device-install")).toBeHidden();
    expect(posted).toStrictEqual([{ userLibrary: USER_LIBRARY, force: false }]);
  });

  test("offers Update for an older copy", async ({ page }) => {
    await setupSettingsTest(page);
    await stubDevice(
      page,
      status({ state: "installed-older", installedVersion: "1.1.0" }),
    );
    await openInstallationTab(page);

    await expect(page.getByTestId("device-status")).toHaveText(
      "Update available: your User Library has v1.1.0, this device is v1.2.0",
    );
    await expect(page.getByTestId("device-install")).toHaveText("Update");
  });

  test("asks before replacing a newer copy, and says so to the server", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    const posted = await stubDevice(
      page,
      status({ state: "installed-newer", installedVersion: "1.3.0" }),
      {
        status: 200,
        body: {
          outcome: "updated",
          path: DEVICE_PATH,
          detail: "Replaced the installed device.",
        },
      },
    );

    await openInstallationTab(page);

    await expect(page.getByTestId("device-install")).toHaveText(
      "Replace with this device",
    );

    await page.getByTestId("device-install").click();

    await expect(page.getByTestId("device-installed-path")).toContainText(
      "Replaced the installed device.",
    );
    expect(posted).toStrictEqual([{ userLibrary: USER_LIBRARY, force: true }]);
  });

  test("won't copy a development device", async ({ page }) => {
    await setupSettingsTest(page);
    await stubDevice(
      page,
      status({ problem: "not-frozen", state: null, path: null }),
    );
    await openInstallationTab(page);

    await expect(page.getByTestId("device-status")).toContainText(
      "development device",
    );
    await expect(page.getByTestId("device-status")).toContainText(
      "Freeze it first",
    );
    await expect(page.getByTestId("device-install")).toBeHidden();
  });

  test("shows the server's reason when the install fails", async ({ page }) => {
    await setupSettingsTest(page);
    await stubDevice(page, status(), {
      status: 500,
      body: { error: "Couldn't install the device. ENOSPC: copy" },
    });
    await openInstallationTab(page);

    await page.getByTestId("device-install").click();

    await expect(page.getByTestId("device-error")).toHaveText(
      "Couldn't install the device. ENOSPC: copy",
    );
    await expect(page.getByTestId("device-installed-path")).toBeHidden();
  });
});

/** A copy of this device in the User Library that the swap is offered for. */
const SWAPPABLE = status({
  state: "same",
  installedVersion: "1.2.0",
  swap: { allowed: true, reason: null },
});

/**
 * Stub the swap POST. A swap kills the server that gets it, so by default the
 * connection drops without an answer, and the status the page polls then shows
 * the new device after `polls` reads.
 * @param page - Playwright page
 * @param initial - The status before the swap
 * @param swap - How the POST answers: dropped (the default), or a status and body
 * @param swap.status - HTTP status of the answer
 * @param swap.body - JSON body of the answer
 * @param polls - How many reads still show the old device after the POST
 * @returns The bodies the swap POST received
 */
async function stubSwap(
  page: Page,
  initial: DeviceStatus,
  swap: { status: number; body: unknown } | null = null,
  polls = 1,
): Promise<unknown[]> {
  const posted: unknown[] = [];
  let swapped = false;
  let readsSinceSwap = 0;

  await page.route("**/device-install", (route) => {
    if (swapped && ++readsSinceSwap > polls) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...initial, inUserLibrary: true }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(initial),
    });
  });
  await page.route("**/device-install/swap", (route) => {
    posted.push(route.request().postDataJSON());

    if (swap == null) {
      swapped = true;

      return route.abort("connectionreset");
    }

    return route.fulfill({
      status: swap.status,
      contentType: "application/json",
      body: JSON.stringify(swap.body),
    });
  });

  return posted;
}

test.describe("Settings — installation: device swap (stubbed backend)", () => {
  test("offers the swap, then waits for the new device and says to save the Set", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    const posted = await stubSwap(page, SWAPPABLE);

    await openInstallationTab(page);

    await expect(page.getByTestId("device-swap")).toBeEnabled();

    await page.getByTestId("device-swap").click();

    // The old server died with the swap: the page keeps watching.
    await expect(page.getByTestId("device-swap-waiting")).toBeVisible();
    await expect(page.getByTestId("device-swap")).toBeHidden();
    await expect(page.getByTestId("device-swap-done")).toContainText(
      "Save your Live Set",
      { timeout: 15_000 },
    );
    expect(posted).toStrictEqual([{ userLibrary: USER_LIBRARY }]);
  });

  test("shows why the swap isn't offered", async ({ page }) => {
    await setupSettingsTest(page);
    await stubDevice(
      page,
      status({
        swap: { allowed: false, reason: "The remote script isn't running." },
      }),
    );
    await openInstallationTab(page);

    await expect(page.getByTestId("device-swap")).toBeDisabled();
    await expect(page.getByTestId("device-swap-note")).toHaveText(
      "The remote script isn't running.",
    );
  });

  test("offers nothing once the device is the User Library copy", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await stubDevice(page, { ...SWAPPABLE, inUserLibrary: true });
    await openInstallationTab(page);

    await expect(page.getByTestId("device-status")).toBeVisible();
    await expect(page.getByTestId("device-swap-section")).toBeHidden();
  });

  test("shows the server's reason and keeps the button when the swap is refused", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await stubSwap(page, SWAPPABLE, {
      status: 409,
      body: { error: "Producer Pal isn't in this Live Set" },
    });
    await openInstallationTab(page);

    await page.getByTestId("device-swap").click();

    await expect(page.getByTestId("device-swap-error")).toHaveText(
      "Producer Pal isn't in this Live Set",
    );
    await expect(page.getByTestId("device-swap")).toBeEnabled();
  });
});

test.describe("Settings — installation: notice options (stubbed backend)", () => {
  test("holds both device notice checkboxes, on by default, and writes a change", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await stubDevice(page, status());

    const writes: unknown[] = [];

    await page.route("**/settings", (route) => {
      if (route.request().method() === "PUT") {
        writes.push(route.request().postDataJSON());
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          autoUpdateCheck: true,
          dismissedUpdateVersion: null,
          warnIfInstallIncomplete: true,
        }),
      });
    });
    await openInstallationTab(page);

    const warn = page.getByTestId("warn-install-incomplete");
    const updates = page.getByTestId("auto-update-check");

    await expect(warn).toBeChecked();
    await expect(updates).toBeChecked();
    await expect(
      page.getByTestId("installation-options").getByRole("link", {
        name: "Learn more",
      }),
    ).toHaveAttribute(
      "href",
      "https://producer-pal.org/installation#finish-the-installation",
    );

    await warn.uncheck();
    await updates.uncheck();

    await expect
      .poll(() => writes)
      .toStrictEqual([
        { warnIfInstallIncomplete: false },
        { autoUpdateCheck: false },
      ]);
  });

  test("moved the update check out of Preferences", async ({ page }) => {
    await setupSettingsTest(page);
    await page.getByRole("button", { name: "Preferences" }).click();

    await expect(page.getByTestId("max-tool-steps")).toBeVisible();
    await expect(
      page.getByText("Automatically check for new versions"),
    ).toBeHidden();
  });
});

test.describe("Settings — ?settings=installation link", () => {
  test("opens the settings on the Installation tab and clears the parameter", async ({
    page,
  }) => {
    await installStubs(page);
    await stubDevice(page, status());
    await page.goto("/chat-ui.html?settings=installation");

    await expect(page.getByTestId("device-status")).toHaveText(
      "Not in your User Library",
    );
    await expect(page.getByTestId("installation-tab")).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
  });

  test("ignores a tab that doesn't exist", async ({ page }) => {
    await installStubs(page);
    await page.goto("/chat-ui.html?settings=nope");

    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(page.getByTestId("installation-tab")).toBeHidden();
    expect(new URL(page.url()).search).toBe("");
  });
});
