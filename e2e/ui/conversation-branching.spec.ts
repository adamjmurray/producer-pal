// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  makeConversation,
  setupConsoleCapture,
  setupUiTest,
} from "./ui-test-helpers";

const captured = setupConsoleCapture();

// Two sibling branches of one turn: a shared first message, then divergent
// assistant replies. The fork (newer) names the trunk as its parent and anchors
// its arrows under message index 0. Seeding the records directly exercises the
// branch UI (roll-up, ‹ n/m › arrows, switch) with no LLM or fork flow needed.
const SHARED_PROMPT = "SHARED_FORK_PROMPT";
const TRUNK_REPLY = "TRUNK_REPLY";
const FORK_REPLY = "FORK_REPLY";

const SIBLINGS = [
  makeConversation({
    id: "trunk",
    title: "Branching demo",
    createdAt: 1,
    updatedAt: 10,
    messages: [
      { role: "user", content: SHARED_PROMPT },
      { role: "assistant", content: TRUNK_REPLY },
    ],
  }),
  makeConversation({
    id: "fork",
    title: "Branching demo",
    createdAt: 2,
    updatedAt: 20,
    forkParentId: "trunk",
    forkedAtIndex: 0,
    messages: [
      { role: "user", content: SHARED_PROMPT },
      { role: "assistant", content: FORK_REPLY },
    ],
  }),
];

// Two sibling branches produced by *retrying* a response: the user prompt is
// shared and unchanged across both, only the assistant reply differs, and the
// fork anchors its arrows under the response (index 1) — not the prompt. This is
// the retry counterpart to the edit fork above (which anchors under index 0).
const RETRY_PROMPT = "RETRY_PROMPT";
const RETRY_TRUNK_REPLY = "RETRY_TRUNK_REPLY";
const RETRY_FORK_REPLY = "RETRY_FORK_REPLY";

const RETRY_SIBLINGS = [
  makeConversation({
    id: "retry-trunk",
    title: "Retry demo",
    createdAt: 1,
    updatedAt: 10,
    messages: [
      { role: "user", content: RETRY_PROMPT },
      { role: "assistant", content: RETRY_TRUNK_REPLY },
    ],
  }),
  makeConversation({
    id: "retry-fork",
    title: "Retry demo",
    createdAt: 2,
    updatedAt: 20,
    forkParentId: "retry-trunk",
    forkedAtIndex: 1,
    messages: [
      { role: "user", content: RETRY_PROMPT },
      { role: "assistant", content: RETRY_FORK_REPLY },
    ],
  }),
];

test.describe("Conversation branching (stubbed backend)", () => {
  test("collapses a branch family to one history entry", async ({ page }) => {
    await setupUiTest(page, SIBLINGS);

    const items = page.getByTestId("conversation-item");

    // Both siblings roll up to a single row (not two).
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Branching demo");

    expectNoConsoleOutput(captured);
  });

  test("shows ‹ n/m › arrows and pages between siblings", async ({ page }) => {
    await setupUiTest(page, SIBLINGS);

    // The collapsed row represents the newest sibling (the fork).
    await page.getByTestId("conversation-item").first().click();
    await expect(page.getByTestId("assistant-message-bubble")).toContainText(
      FORK_REPLY,
    );

    // Arrows appear under the fork point: viewing the fork is 2 of 2.
    await expect(page.getByTestId("branch-nav-position")).toHaveText("2 / 2");

    const prev = page.getByRole("button", { name: "Previous version" });
    const next = page.getByRole("button", { name: "Next version" });

    await expect(prev).toBeEnabled();
    await expect(next).toBeDisabled();

    // Page back to the original branch.
    await prev.click();

    await expect(page.getByTestId("assistant-message-bubble")).toContainText(
      TRUNK_REPLY,
    );
    await expect(page.getByTestId("branch-nav-position")).toHaveText("1 / 2");
    await expect(
      page.getByRole("button", { name: "Previous version" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Next version" }),
    ).toBeEnabled();

    expectNoConsoleOutput(captured);
  });

  test("anchors retry arrows under the response, keeping the prompt", async ({
    page,
  }) => {
    await setupUiTest(page, RETRY_SIBLINGS);

    // The collapsed row opens to the newest sibling (the retry fork).
    await page.getByTestId("conversation-item").first().click();

    const prompt = page.locator('[data-message-index="0"]');
    const reply = page.getByTestId("assistant-message-bubble");
    const branchNav = page.getByTestId("branch-nav");

    await expect(reply).toContainText(RETRY_FORK_REPLY);
    await expect(page.getByTestId("branch-nav-position")).toHaveText("2 / 2");

    // The arrows sit under the response, not the prompt: in DOM order the
    // branch-nav row follows the assistant bubble (this is the retry anchor at
    // index 1 — an edit fork would anchor it under the prompt at index 0).
    const replyHandle = await reply.elementHandle();

    if (replyHandle == null) throw new Error("assistant bubble not found");

    const navFollowsReply = await branchNav.evaluate(
      (nav, bubble) =>
        !!(
          bubble.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
      replyHandle,
    );

    expect(navFollowsReply).toBe(true);

    // Paging back swaps the response but leaves the shared prompt untouched —
    // the hallmark of a retry fork (an edit fork would change the prompt).
    await page.getByRole("button", { name: "Previous version" }).click();

    await expect(reply).toContainText(RETRY_TRUNK_REPLY);
    await expect(prompt).toContainText(RETRY_PROMPT);
    await expect(page.getByTestId("branch-nav-position")).toHaveText("1 / 2");

    expectNoConsoleOutput(captured);
  });
});
