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
});
