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

test.describe("System prompt notice (stubbed backend)", () => {
  test("its customize link opens the context editor on the Instructions tab", async ({
    page,
  }) => {
    await setupUiTest(page, [
      makeConversation({
        id: "with-messages",
        title: "Has messages",
        updatedAt: 100,
        messages: [
          { role: "user", content: "FIXTURE_USER_PROMPT" },
          { role: "assistant", content: "FIXTURE_ASSISTANT_REPLY" },
        ],
      }),
    ]);

    await page.getByTestId("conversation-item").click();

    // The notice sits above the first bubble; the caveat lives in its tooltip.
    const customize = page.getByRole("button", {
      name: "Customize system prompt",
    });

    await expect(customize).toHaveAttribute("title", /new chats/);
    await customize.click();

    const instructionsTab = page.getByRole("button", {
      name: "Instructions",
      exact: true,
    });

    await expect(instructionsTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/only that chat uses it/i)).toBeVisible();

    expectNoConsoleOutput(captured);
  });
});
