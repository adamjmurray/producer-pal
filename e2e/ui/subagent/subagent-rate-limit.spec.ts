// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A worker rate-limited mid-run. Nothing it does reaches the orchestrator's
// stream, so without the out-of-band status channel its card would sit on
// "working…" through a backoff that can last minutes. This is the only place
// that channel is exercised against a real render.

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

const TASK = "write a bass line";
const WORKER_REPLY = "Wrote the bass line.";
const FINAL_REPLY = "All done.";

/**
 * The worker's first attempt is rate-limited; its retry succeeds.
 * @param call - The request being answered
 * @returns The stubbed model's reply
 */
function rateLimitFirstAttempt(call: LlmCall): LlmReply {
  if (call.caller === "worker") {
    return call.n === 1 ? { rateLimited: true } : { text: WORKER_REPLY };
  }

  return call.afterToolResult
    ? { text: FINAL_REPLY }
    : { spawn: { task: TASK } };
}

test.describe("Subagent rate limit", () => {
  test("shows the backoff on the card, then finishes", async ({ page }) => {
    await setupSubagentTest(page, rateLimitFirstAttempt, {
      briefing: "## Ableton Live Set\n\n120 bpm, 4/4",
    });

    await sendChatMessage(page, "delegate the bass line");

    const card = subagentCard(page);

    // The status chip is the collapsed view of the wait — amber, not "working…".
    await expect(card).toContainText("rate limited");

    await expandDisclosure(card);
    await expect(card).toContainText(/Rate limited — retrying in \d+s/);
    await expect(card).toContainText("attempt 1 of 5");

    // The retry resumes the same worker, so the run finishes normally.
    await expect(card).toContainText("done", { timeout: 30_000 });
    await expect(card).toContainText(WORKER_REPLY);
    await expect(page.getByText(FINAL_REPLY)).toBeVisible();

    expectNoConsoleOutput(captured);
  });
});
