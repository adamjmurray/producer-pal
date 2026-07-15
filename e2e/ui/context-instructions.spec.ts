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

test.describe("Context editor — custom instructions (stubbed backend)", () => {
  test("customizes the system prompt, persists it, then restores the default", async ({
    page,
  }) => {
    const state = await setupContextTest(page);

    await openContextTab(page, "Instructions");
    // With no override the built-in is shown read-only behind a "Customize".
    await expect(page.getByRole("button", { name: "Customize" })).toBeVisible();

    // Fork the built-in, replace it, and confirm it saved to /system-prompt.
    await customizeOverride(page);
    await typeInPrimaryEditor(page, "MY CUSTOM INSTRUCTIONS", true);
    await expect.poll(() => state.systemPrompt).toBe("MY CUSTOM INSTRUCTIONS");

    // The override persists across a reload.
    await page.reload();
    await openContextTab(page, "Instructions");
    await expect(primaryEditor(page)).toContainText("MY CUSTOM INSTRUCTIONS");

    // Reset → confirm → the override is deleted and the built-in returns.
    page.on("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Reset to default" }).click();
    await expect.poll(() => state.systemPrompt).toBe("");
    await expect(page.getByRole("button", { name: "Customize" })).toBeVisible();

    expectNoConsoleOutput(captured);
  });
});
