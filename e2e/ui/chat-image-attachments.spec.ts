// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  installStubs,
  setupConsoleCapture,
} from "./ui-test-helpers";

const captured = setupConsoleCapture();

// A 1x1 PNG, small enough to inline as the attached file's bytes.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("chat image attachments", () => {
  test("attaches an image with the file picker and removes it again", async ({
    page,
  }) => {
    // No seeded history and no panel: this is the composer on a fresh chat.
    await installStubs(page);
    await page.goto("/chat-ui.html");

    const thumbnail = page.getByAltText("Attachment 1");

    await expect(thumbnail).toBeHidden();

    await page.getByTestId("image-file-input").setInputFiles({
      name: "groove.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    });

    await expect(thumbnail).toBeVisible();
    // An image alone is a sendable message, even with no text typed.
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();

    await page.getByRole("button", { name: "Remove attachment 1" }).click();

    await expect(thumbnail).toBeHidden();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    expectNoConsoleOutput(captured);
  });
});
