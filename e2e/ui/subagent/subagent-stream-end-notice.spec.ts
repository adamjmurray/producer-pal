// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A worker the provider's content filter cuts off. Its notice is the spawn
// result, so the orchestrator learns why the worker stopped rather than being
// told it finished without a message.

import { expect, test } from "@playwright/test";
import { expectNoConsoleOutput, setupConsoleCapture } from "../ui-test-helpers";
import {
  type LlmCall,
  type LlmReply,
  expandDisclosure,
  sendChatMessage,
  setupSubagentTest,
  subagentCard,
} from "./subagent-test-helpers";

const captured = setupConsoleCapture();

const FINAL_REPLY = "The worker was stopped, so I will stop here.";
const NOTICE = "its content filter";

/**
 * The worker is filtered before saying anything.
 * @param call - The request being answered
 * @returns The stubbed model's reply
 */
function filteredWorker(call: LlmCall): LlmReply {
  if (call.caller === "worker") {
    return { finishReason: "content_filter" };
  }

  return call.afterToolResult
    ? { text: FINAL_REPLY }
    : { spawn: { task: "write a bass line" } };
}

test.describe("Subagent stream end notice", () => {
  test("hands the orchestrator the filter notice as the worker's result", async ({
    page,
  }) => {
    const harness = await setupSubagentTest(page, filteredWorker, {
      briefing: "## Ableton Live Set\n\n120 bpm, 4/4",
    });

    await sendChatMessage(page, "delegate the bass line");
    await expect(page.getByText(FINAL_REPLY)).toBeVisible();

    const card = subagentCard(page);

    await expandDisclosure(card);
    await expect(card).toContainText(NOTICE);

    const followUp = harness.calls.find(
      (c) => c.caller === "orchestrator" && c.afterToolResult,
    ) as LlmCall;

    expect(followUp.messagesJson).toContain(NOTICE);
    expect(followUp.messagesJson).not.toContain("without a final message");

    expectNoConsoleOutput(captured);
  });
});
