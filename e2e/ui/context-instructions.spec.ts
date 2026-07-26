// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  forkByTyping,
  openContextTab,
  primaryEditor,
  setupConsoleCapture,
  setupContextTest,
  UNFORKED_LABEL,
} from "./context-test-helpers";

const captured = setupConsoleCapture();

test.describe("Context editor — custom instructions (stubbed backend)", () => {
  test("customizes the system prompt, persists it, then restores the default", async ({
    page,
  }) => {
    const state = await setupContextTest(page);

    await openContextTab(page, "Instructions");
    // With no override the editor holds the built-in, ready to be typed over.
    await expect(page.getByText(UNFORKED_LABEL)).toBeVisible();

    // Typing over the built-in forks it; confirm it saved to /system-prompt.
    await forkByTyping(page, "MY CUSTOM INSTRUCTIONS");
    await expect.poll(() => state.systemPrompt).toBe("MY CUSTOM INSTRUCTIONS");

    // The override persists across a reload.
    await page.reload();
    await openContextTab(page, "Instructions");
    await expect(primaryEditor(page)).toContainText("MY CUSTOM INSTRUCTIONS");

    // Reset → confirm → the override is deleted and the built-in returns.
    page.on("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Reset to default" }).click();
    await expect.poll(() => state.systemPrompt).toBe("");
    await expect(page.getByText(UNFORKED_LABEL)).toBeVisible();
    // The reset re-seeded the editor with the built-in, ready to fork again.
    await expect(primaryEditor(page)).toContainText(
      "You are an AI music composition assistant",
    );

    expectNoConsoleOutput(captured);
  });
});
