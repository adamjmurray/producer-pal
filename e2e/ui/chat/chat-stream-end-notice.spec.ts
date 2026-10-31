// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A provider that ends a reply without saying anything must not leave the chat
// blank: the user sees a notice saying why.

import { expect, test } from "@playwright/test";
import { expectNoConsoleOutput, setupConsoleCapture } from "../ui-test-helpers";
import {
  sendChatMessage,
  setupSubagentTest,
} from "../subagent/subagent-test-helpers";

const captured = setupConsoleCapture();

test.describe("Stream end notice", () => {
  test("shows the content-filter notice for a filtered reply", async ({
    page,
  }) => {
    await setupSubagentTest(page, () => ({ finishReason: "content_filter" }));
    await sendChatMessage(page, "write something");

    await expect(
      page.getByText(
        "The provider stopped this reply because of its content filter. Use Retry, or edit your message and rephrase it.",
      ),
    ).toBeVisible();

    expectNoConsoleOutput(captured);
  });

  test("shows the empty-reply notice when the finish reason is unknown", async ({
    page,
  }) => {
    await setupSubagentTest(page, () => ({ finishReason: "unmapped_reason" }));
    await sendChatMessage(page, "write something");

    await expect(
      page.getByText(
        "The provider ended this reply without any content. Use Retry, or edit your message.",
      ),
    ).toBeVisible();

    expectNoConsoleOutput(captured);
  });
});
