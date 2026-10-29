// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Docs screenshots of the Installation tab, one per install stage.

import { type Page, test } from "@playwright/test";
import { openInstallationTab } from "../settings-test-helpers";
import {
  REMOTE_SCRIPT_RUNNING,
  type ScreenshotSetup,
  VERSION,
  deviceStatus,
  remoteScriptStatus,
  saveDialogScreenshot,
  setupScreenshot,
} from "./screenshot-setup";

test.use({
  colorScheme: "dark",
  deviceScaleFactor: 2,
  viewport: { width: 760, height: 1300 },
});

async function shoot(
  page: Page,
  setup: ScreenshotSetup,
  file: string,
): Promise<void> {
  await setupScreenshot(page, setup);
  await openInstallationTab(page);
  await saveDialogScreenshot(page, file);
}

test("device from Downloads, nothing installed", async ({ page }) => {
  await shoot(
    page,
    {
      device: deviceStatus({
        source: "/Users/you/Downloads/Producer_Pal.amxd",
        inUserLibrary: false,
        state: "not-installed",
        installedVersion: null,
        swap: {
          allowed: false,
          reason:
            "There is no copy of this device in your User Library yet. Install it first.",
        },
      }),
      remoteScript: remoteScriptStatus(),
    },
    "producer-pal-chat-settings-remote-script-pre-install.png",
  );
});

test("device in User Library, remote script not installed", async ({
  page,
}) => {
  await shoot(
    page,
    { remoteScript: remoteScriptStatus() },
    "producer-pal-chat-settings-installation.png",
  );
});

test("remote script installed, not running", async ({ page }) => {
  await shoot(
    page,
    {
      remoteScript: remoteScriptStatus({
        installed: true,
        installedVersion: VERSION,
      }),
    },
    "producer-pal-chat-settings-remote-script-post-install.png",
  );
});

test("everything running", async ({ page }) => {
  await shoot(
    page,
    { remoteScript: REMOTE_SCRIPT_RUNNING },
    "producer-pal-chat-settings-remote-script-running.png",
  );
});
