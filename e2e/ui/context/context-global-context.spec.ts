// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  openContextTab,
  primaryEditor,
  setupConsoleCapture,
  setupContextTest,
  typeInPrimaryEditor,
} from "./context-test-helpers";

const captured = setupConsoleCapture();

test.describe("Context editor — global context (stubbed backend)", () => {
  test("edits and saves, persists across reload, then clears to empty", async ({
    page,
  }) => {
    const state = await setupContextTest(page);

    await openContextTab(page, "Global");
    await expect(primaryEditor(page)).toBeVisible();

    // Edit → the debounced autosave PUTs to /global-context.
    await typeInPrimaryEditor(page, "Global notes v1");
    await expect.poll(() => state.globalContext).toBe("Global notes v1");

    // Reload re-reads the persisted value from the (stateful) backend.
    await page.reload();
    await openContextTab(page, "Global");
    await expect(primaryEditor(page)).toContainText("Global notes v1");

    // Clear → confirm → the empty state persists too.
    page.on("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect.poll(() => state.globalContext).toBe("");

    await page.reload();
    await openContextTab(page, "Global");
    await expect(primaryEditor(page)).not.toContainText("Global notes v1");

    expectNoConsoleOutput(captured);
  });
});
