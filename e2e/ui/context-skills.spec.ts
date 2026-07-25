// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import {
  customizeOverride,
  expectNoConsoleOutput,
  openContextTab,
  primaryEditor,
  setupConsoleCapture,
  setupContextTest,
  typeInPrimaryEditor,
} from "./context-test-helpers";

const captured = setupConsoleCapture();

test.describe("Context editor — skills fragments (stubbed backend)", () => {
  test("overrides a skill fragment, saves it, and persists across reload", async ({
    page,
  }) => {
    const state = await setupContextTest(page);

    await openContextTab(page, "Skills");
    // The first slot has no override, so its built-in is shown with "Customize".
    await expect(page.getByRole("button", { name: "Customize" })).toBeVisible();

    // Fork the built-in fragment, replace it, and confirm the override saved.
    await customizeOverride(page);
    await typeInPrimaryEditor(page, "CUSTOM SKILL FRAGMENT", true);
    await expect
      .poll(() => state.slots.find((s) => s.name === "slot-one")?.override)
      .toBe("CUSTOM SKILL FRAGMENT");

    // The override persists across a reload.
    await page.reload();
    await openContextTab(page, "Skills");
    await expect(primaryEditor(page)).toContainText("CUSTOM SKILL FRAGMENT");

    expectNoConsoleOutput(captured);
  });

  test("switches a fragment off and persists it across reload", async ({
    page,
  }) => {
    const state = await setupContextTest(page);

    await openContextTab(page, "Skills");
    // The box is server-authoritative (checked from the slot state), so it
    // settles on the write's echo rather than on the click itself.
    await page.getByLabel("Include").click();

    await expect
      .poll(() => state.slots.find((s) => s.name === "slot-one")?.enabled)
      .toBe(false);
    await expect(page.getByLabel("Include")).not.toBeChecked();

    // The dropdown marks it off, and the state survives a reload.
    await expect(page.getByRole("option", { name: /✕/ })).toBeAttached();
    await page.reload();
    await openContextTab(page, "Skills");
    await expect(page.getByLabel("Include")).not.toBeChecked();

    expectNoConsoleOutput(captured);
  });
});
