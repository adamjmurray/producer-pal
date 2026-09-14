// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Opus 5 (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Keyboard reach of the composer: Tab must get to the message box, Send and the
// rest of the composer without walking the transcript's buttons and links, and
// a closed history panel must stay out of the way. Only a real browser answers
// this — tab order is the browser's, not the DOM's.
import { type Page, expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  makeConversation,
  setupConsoleCapture,
  setupUiTest,
} from "./ui-test-helpers";

const captured = setupConsoleCapture();

const COMPOSER_STOPS = [
  "Message",
  "Thinking level: Default",
  "Attach images",
  "Send",
];

// Buttons the transcript puts on every message pair, plus the notice above it.
const TRANSCRIPT_STOPS = [
  "Customize system prompt",
  "Edit message",
  "Retry from your last message",
];

test.describe("Chat tab order (stubbed backend)", () => {
  test("reaches the composer before the transcript, and keeps it on screen below", async ({
    page,
  }) => {
    await setupUiTest(page, [
      makeConversation({
        id: "tab-order",
        title: "Seeded chat",
        updatedAt: 100,
        messages: [
          { role: "user", content: "first question" },
          { role: "assistant", content: "a [link](https://example.com) reply" },
          { role: "user", content: "second question" },
          { role: "assistant", content: "another reply" },
        ],
      }),
    ]);

    await page.getByTestId("conversation-item").click();

    const historyToggle = page.getByRole("button", {
      name: "Toggle conversation history",
    });

    await historyToggle.click(); // close the panel

    // Send only joins the tab order once there is something to send.
    const input = page.getByRole("textbox", { name: "Message" });

    await input.click();
    await input.pressSequentially("hello");

    await historyToggle.focus();

    const order = await collectTabOrder(page, 24);
    const at = (label: string) => order.indexOf(label);

    for (const label of [...COMPOSER_STOPS, ...TRANSCRIPT_STOPS]) {
      expect(order, `missing tab stop: ${label}`).toContain(label);
    }

    // Every composer control comes before the first transcript control.
    const firstTranscript = Math.min(...TRANSCRIPT_STOPS.map(at));

    for (const label of COMPOSER_STOPS) {
      expect(at(label), `${label} should precede the transcript`).toBeLessThan(
        firstTranscript,
      );
    }

    // A closed history panel is clipped, not hidden, so its rows would
    // otherwise sit in the tab path — one set per saved conversation.
    expect(order).not.toContain("Rename conversation");
    expect(order).not.toContain("New Conversation");

    // DOM order is composer-first, but CSS `order` keeps it below the
    // transcript on screen.
    const send = await page.getByRole("button", { name: "Send" }).boundingBox();
    const bubble = await page
      .getByTestId("assistant-message-bubble")
      .first()
      .boundingBox();

    expect(send?.y ?? 0).toBeGreaterThan(bubble?.y ?? 0);

    expectNoConsoleOutput(captured);
  });
});

/**
 * Walk focus forward with Tab, collecting a label for each stop. The composer's
 * CodeMirror binds Tab to indent, so leave it the documented way: Escape first.
 * @param page - Playwright page
 * @param steps - How many Tab presses to record
 * @returns Labels of the focused elements, in tab order
 */
async function collectTabOrder(page: Page, steps: number): Promise<string[]> {
  const labels: string[] = [];

  for (let i = 0; i < steps; i++) {
    if (
      await page.evaluate(
        () => document.activeElement?.closest(".cm-editor") != null,
      )
    ) {
      await page.keyboard.press("Escape");
    }

    await page.keyboard.press("Tab");
    labels.push(
      await page.evaluate(() => {
        const el = document.activeElement;

        return (
          el?.getAttribute("aria-label") ??
          el?.textContent?.trim().slice(0, 40) ??
          "<none>"
        );
      }),
    );
  }

  return labels;
}
