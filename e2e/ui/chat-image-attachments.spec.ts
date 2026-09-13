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

  test("scales a large image down to 1568 px on its longest side", async ({
    page,
  }) => {
    await installStubs(page);
    await page.goto("/chat-ui.html");

    // A 4000x2000 canvas, encoded in the page: no image fixture to check in.
    const bigPng = await page.evaluate(() => {
      const canvas = document.createElement("canvas");

      canvas.width = 4000;
      canvas.height = 2000;

      return canvas.toDataURL("image/png").split(",")[1] ?? "";
    });

    await page.getByTestId("image-file-input").setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: Buffer.from(bigPng, "base64"),
    });

    const thumbnail = page.getByAltText("Attachment 1");

    await expect(thumbnail).toBeVisible();
    await expect
      .poll(async () =>
        thumbnail.evaluate((img) => [
          (img as HTMLImageElement).naturalWidth,
          (img as HTMLImageElement).naturalHeight,
        ]),
      )
      .toStrictEqual([1568, 784]);

    expectNoConsoleOutput(captured);
  });
});
