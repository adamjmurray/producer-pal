// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The Preferences tab's tool-step budget. Unlike the presets next door, this
// one is buffered and written by the footer Save, so the round-trip through the
// modal is the part worth guarding.

import { expect, test } from "@playwright/test";
import {
  openPreferencesTab,
  openSettings,
  readMaxToolSteps,
  saveSettings,
  setupSettingsTest,
} from "./settings-test-helpers";

test.describe("Settings — tool-step budget (stubbed backend)", () => {
  test("saves a new budget and reloads it", async ({ page }) => {
    await setupSettingsTest(page);
    await openPreferencesTab(page);

    // Unset until the user picks one — the chat falls back to the default.
    expect(await readMaxToolSteps(page)).toBeNull();

    await page.getByTestId("max-tool-steps").fill("40");
    await saveSettings(page);

    expect(await readMaxToolSteps(page)).toBe("40");

    await page.reload();
    await openSettings(page);
    await openPreferencesTab(page);

    await expect(page.getByTestId("max-tool-steps")).toHaveValue("40");
  });

  test("does not store an out-of-range budget", async ({ page }) => {
    await setupSettingsTest(page);
    await openPreferencesTab(page);

    await page.getByTestId("max-tool-steps").fill("4");
    await saveSettings(page);

    // Never committed to the buffer, so Save writes the default it still holds
    // rather than a budget that would strand every turn.
    expect(await readMaxToolSteps(page)).toBe("25");
  });
});
