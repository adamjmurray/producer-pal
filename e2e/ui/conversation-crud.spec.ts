// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  makeConversation,
  readConversationsFromDb,
  sendChatMessage,
  setupConsoleCapture,
  setupUiTest,
} from "./ui-test-helpers";

const captured = setupConsoleCapture();

/**
 * The conversation-list rows whose text matches.
 * @param page - The page under test
 * @param title - Text the row must contain
 * @returns The matching rows
 */
function conversationRows(page: Page, title: string): Locator {
  return page.getByTestId("conversation-item").filter({ hasText: title });
}

/**
 * Load a single conversation holding one exchange, and open it.
 * @param page - The page under test
 * @param id - The conversation id to store it under
 */
async function openConversationWithMessages(
  page: Page,
  id: string,
): Promise<void> {
  await setupUiTest(page, [
    makeConversation({
      id,
      title: "Has messages",
      updatedAt: 100,
      messages: [
        { role: "user", content: "FIXTURE_USER_PROMPT" },
        { role: "assistant", content: "FIXTURE_ASSISTANT_REPLY" },
      ],
    }),
  ]);

  await conversationRows(page, "Has messages").click();
}

test.describe("Conversation history CRUD (stubbed backend)", () => {
  test("loads the conversation list from IndexedDB, newest first", async ({
    page,
  }) => {
    await setupUiTest(page, [
      makeConversation({ id: "a", title: "Oldest convo", updatedAt: 10 }),
      makeConversation({ id: "b", title: "Middle convo", updatedAt: 20 }),
      makeConversation({ id: "c", title: "Newest convo", updatedAt: 30 }),
    ]);

    const items = page.getByTestId("conversation-item");

    await expect(items).toHaveCount(3);
    // Sorted by updatedAt descending.
    await expect(items.nth(0)).toContainText("Newest convo");
    await expect(items.nth(1)).toContainText("Middle convo");
    await expect(items.nth(2)).toContainText("Oldest convo");
    // Provider/model metadata renders.
    await expect(items.nth(0)).toContainText("Google");

    expectNoConsoleOutput(captured);
  });

  test("loads a conversation's messages when selected", async ({ page }) => {
    await openConversationWithMessages(page, "load");

    await expect(page.getByText("FIXTURE_USER_PROMPT")).toBeVisible();
    await expect(page.getByTestId("assistant-message-bubble")).toContainText(
      "FIXTURE_ASSISTANT_REPLY",
    );

    expectNoConsoleOutput(captured);
  });

  test("keeps the restored conversation when a send finds no API key", async ({
    page,
  }) => {
    // Regression: the no-key error rendered (and stashed) the failing message on
    // its own, so the conversation it was sent from vanished from the screen —
    // and the next send bootstrapped from that truncation and saved it over the
    // record. The stubs configure the provider with an empty key, so a plain
    // send is the whole repro.
    await openConversationWithMessages(page, "nokey");

    await expect(page.getByText("FIXTURE_USER_PROMPT")).toBeVisible();

    await sendChatMessage(page, "another question");

    await expect(page.getByText("No API key configured")).toBeVisible();
    // The conversation the message was sent from is still there, error and all.
    await expect(page.getByText("FIXTURE_USER_PROMPT")).toBeVisible();
    await expect(page.getByText("FIXTURE_ASSISTANT_REPLY")).toBeVisible();
    await expect(page.getByText("another question")).toBeVisible();

    // The app logs every error it renders, so this one is expected.
    expect(captured.errors).toHaveLength(1);
    expect(captured.errors[0]).toContain("No API key configured");
    expect(captured.warnings).toEqual([]);
    expect(captured.logs).toEqual([]);
  });

  test("renames a conversation and persists it", async ({ page }) => {
    await setupUiTest(page, [
      makeConversation({ id: "r", title: "Old title", updatedAt: 10 }),
    ]);

    await conversationRows(page, "Old title")
      .getByRole("button", { name: "Rename conversation" })
      .click();

    // Editing swaps the title text for an input (the only row in edit mode at a
    // time), scoped to the items so it never matches the chat composer.
    const input = page.getByTestId("conversation-item").getByRole("textbox");

    await input.fill("New shiny title");
    await input.press("Enter");

    await expect(conversationRows(page, "New shiny title")).toBeVisible();
    await expect(page.getByText("Old title")).toHaveCount(0);

    const records = await readConversationsFromDb(page);

    expect(records.find((r) => r.id === "r")?.title).toBe("New shiny title");

    expectNoConsoleOutput(captured);
  });

  test("stars and unstars a conversation", async ({ page }) => {
    await setupUiTest(page, [
      makeConversation({
        id: "s",
        title: "Star me",
        updatedAt: 10,
        bookmarked: false,
      }),
    ]);

    // Star it.
    await conversationRows(page, "Star me")
      .getByRole("button", { name: "Bookmark conversation" })
      .first()
      .click();

    // A bookmarked conversation gets its own collapsible "Bookmarks" section.
    await expect(page.getByText(/Bookmarks \(1\)/)).toBeVisible();
    expect(
      (await readConversationsFromDb(page)).find((r) => r.id === "s")
        ?.bookmarked,
    ).toBe(true);

    // Unstar it (use the first matching row — bookmarked items render in both
    // the Bookmarks and All Conversations sections).
    await conversationRows(page, "Star me")
      .first()
      .getByRole("button", { name: "Remove bookmark" })
      .click();

    await expect(page.getByText(/Bookmarks \(/)).toHaveCount(0);
    expect(
      (await readConversationsFromDb(page)).find((r) => r.id === "s")
        ?.bookmarked,
    ).toBe(false);

    expectNoConsoleOutput(captured);
  });

  test("deletes a conversation", async ({ page }) => {
    await setupUiTest(page, [
      makeConversation({ id: "d1", title: "Keep me", updatedAt: 20 }),
      makeConversation({ id: "d2", title: "Delete me", updatedAt: 10 }),
    ]);

    await conversationRows(page, "Delete me")
      .getByRole("button", { name: "Delete conversation" })
      .click();

    const items = page.getByTestId("conversation-item");

    await expect(items).toHaveCount(1);
    await expect(items.filter({ hasText: "Delete me" })).toHaveCount(0);
    await expect(page.getByText("Keep me")).toBeVisible();
    // The undo banner appears, naming the deleted conversation.
    await expect(page.getByText("Deleted “Delete me”")).toBeVisible();

    const records = await readConversationsFromDb(page);

    expect(records.map((r) => r.id)).toEqual(["d1"]);

    expectNoConsoleOutput(captured);
  });

  test("undoes a deletion, restoring the conversation", async ({ page }) => {
    await setupUiTest(page, [
      makeConversation({ id: "u1", title: "Keep me", updatedAt: 20 }),
      makeConversation({ id: "u2", title: "Undo me", updatedAt: 10 }),
    ]);

    await conversationRows(page, "Undo me")
      .getByRole("button", { name: "Delete conversation" })
      .click();

    const items = page.getByTestId("conversation-item");

    await expect(items).toHaveCount(1);

    await page.getByRole("button", { name: "Undo" }).click();

    await expect(items).toHaveCount(2);
    await expect(items.filter({ hasText: "Undo me" })).toHaveCount(1);
    // The undo banner clears once the record is restored.
    await expect(page.getByText("Deleted “Undo me”")).toHaveCount(0);

    const records = await readConversationsFromDb(page);

    expect(records.map((r) => r.id).toSorted()).toEqual(["u1", "u2"]);

    expectNoConsoleOutput(captured);
  });
});
