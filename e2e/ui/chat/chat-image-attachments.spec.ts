// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect, type Page, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  installStubs,
  makeConversation,
  setupConsoleCapture,
  setupUiTest,
} from "../ui-test-helpers";

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

    await attachPng(page);

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

  test("pasting a copied file attaches the image without its file name", async ({
    page,
  }) => {
    await installStubs(page);
    await page.goto("/chat-ui.html");

    // What a Finder copy puts on the clipboard: the file, plus its name as text.
    await page
      .getByRole("textbox", { name: "Message" })
      .evaluate((editor, base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const data = new DataTransfer();

        data.items.add(new File([bytes], "groove.png", { type: "image/png" }));
        data.setData("text/plain", "groove.png");
        editor.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      }, PNG_BYTES.toString("base64"));

    await expect(page.getByAltText("Attachment 1")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message" }),
    ).not.toContainText("groove.png");

    expectNoConsoleOutput(captured);
  });

  test("switching conversations leaves the draft and image behind", async ({
    page,
  }) => {
    await setupWithOtherChat(page);

    await page.getByRole("textbox", { name: "Message" }).fill("half a thought");
    await attachPng(page);
    await expect(page.getByAltText("Attachment 1")).toBeVisible();

    await page
      .getByTestId("conversation-item")
      .filter({ hasText: "Other chat" })
      .click();
    await expect(page.getByText("FIXTURE_USER_PROMPT")).toBeVisible();

    await expect(page.getByAltText("Attachment 1")).toBeHidden();
    await expect(
      page.getByRole("textbox", { name: "Message" }),
    ).not.toContainText("half a thought");

    expectNoConsoleOutput(captured);
  });

  test("New conversation in an empty chat and re-opening the open one keep the draft", async ({
    page,
  }) => {
    await setupWithOtherChat(page);

    const composer = page.getByRole("textbox", { name: "Message" });

    // In an empty new chat, "New conversation" has nothing to leave.
    await composer.fill("half a thought");
    await attachPng(page);
    await expect(page.getByAltText("Attachment 1")).toBeVisible();

    // The header button and the history panel's both go through the same path.
    await page
      .getByRole("button", { name: "New conversation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "New Conversation", exact: true })
      .click();

    await expect(composer).toContainText("half a thought");
    await expect(page.getByAltText("Attachment 1")).toBeVisible();

    // Same for clicking the conversation that is already open.
    const item = page
      .getByTestId("conversation-item")
      .filter({ hasText: "Other chat" });

    await item.click();
    await expect(page.getByText("FIXTURE_USER_PROMPT")).toBeVisible();
    await expect(composer).not.toContainText("half a thought");

    await composer.fill("another thought");
    await attachPng(page);
    await expect(page.getByAltText("Attachment 1")).toBeVisible();

    await item.click();
    // The reload reads IndexedDB first; give a wrongful reset time to land.
    await page.waitForTimeout(300);

    await expect(page.getByText("FIXTURE_USER_PROMPT")).toBeVisible();
    await expect(composer).toContainText("another thought");
    await expect(page.getByAltText("Attachment 1")).toBeVisible();

    expectNoConsoleOutput(captured);
  });
});

/**
 * Open the chat UI with one other saved conversation in the history.
 * @param page - Playwright page
 */
async function setupWithOtherChat(page: Page): Promise<void> {
  await setupUiTest(page, [
    makeConversation({
      id: "other",
      title: "Other chat",
      updatedAt: 100,
      messages: [
        { role: "user", content: "FIXTURE_USER_PROMPT" },
        { role: "assistant", content: "FIXTURE_ASSISTANT_REPLY" },
      ],
    }),
  ]);
}

/**
 * Attach the 1x1 PNG with the composer's file picker.
 * @param page - Playwright page
 */
async function attachPng(page: Page): Promise<void> {
  await page.getByTestId("image-file-input").setInputFiles({
    name: "groove.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
}
