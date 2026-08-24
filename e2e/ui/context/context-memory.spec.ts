// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  openContextTab,
  setupConsoleCapture,
  setupContextTest,
} from "./context-test-helpers";

const captured = setupConsoleCapture();

test.describe("Context editor — memory (stubbed backend)", () => {
  test("creates a memory, edits it, and deletes it", async ({ page }) => {
    const state = await setupContextTest(page);

    await openContextTab(page, "Memory");
    await expect(page.getByText("No memories yet.")).toBeVisible();

    // --- Create ---

    await page.getByPlaceholder("prefers-c-minor").fill("prefers-c-minor");
    await page
      .getByRole("textbox", { name: "Description" })
      .fill("Likes the key of C minor");
    const body = page.getByRole("textbox", { name: "Memory" });

    await body.click();
    await body.pressSequentially("Uses C minor a lot.");
    await page.getByRole("button", { name: "Create memory" }).click();

    // Appears in the index and lands in the backend.
    await expect(
      page.getByRole("button", { name: "Edit prefers-c-minor" }),
    ).toBeVisible();
    await expect
      .poll(() => state.memories.map((m) => m.name))
      .toContain("prefers-c-minor");

    // --- Edit (autosaves) ---

    await page
      .getByRole("textbox", { name: "Description" })
      .fill("Prefers C minor for basslines");
    await expect
      .poll(
        () =>
          state.memories.find((m) => m.name === "prefers-c-minor")?.description,
      )
      .toBe("Prefers C minor for basslines");

    // The edit persists across a reload.
    await page.reload();
    await openContextTab(page, "Memory");
    await expect(page.getByText("Prefers C minor for basslines")).toBeVisible();

    // --- Delete ---

    page.on("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete prefers-c-minor" }).click();
    await expect(page.getByText("No memories yet.")).toBeVisible();
    await expect.poll(() => state.memories.length).toBe(0);

    expectNoConsoleOutput(captured);
  });
});
