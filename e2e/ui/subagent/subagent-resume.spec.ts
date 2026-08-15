// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Resuming a worker across two turns: the second spawn passes resumeFrom, so the
// same worker keeps its number and its session. The split that only shows up
// here is what each side gets — the worker is re-seeded with everything it did,
// while its new card carries only what this run added.

import { expect, test } from "@playwright/test";
import { expectNoConsoleOutput, setupConsoleCapture } from "../ui-test-helpers";
import {
  type LlmCall,
  type LlmReply,
  expandDisclosure,
  sendChatMessage,
  setupSubagentTest,
  subagentCard,
  subagentTranscript,
} from "./subagent-test-helpers";

const captured = setupConsoleCapture();

const TASK = "write a bass line";
const FOLLOW_UP = "now make the bass line swing";
const FIRST_REPLY = "Wrote a straight bass line.";
const SECOND_REPLY = "Swung the bass line.";
const BRIEFING = "## Ableton Live Set\n\n120 bpm, 4/4";

/**
 * Two turns: spawn worker 1, then resume it. Orchestrator calls run
 * spawn → report → resume → report, so the call number picks the reply.
 * @param call - The request being answered
 * @returns The stubbed model's reply
 */
function spawnThenResume(call: LlmCall): LlmReply {
  if (call.caller === "worker") {
    return { text: call.n === 1 ? FIRST_REPLY : SECOND_REPLY };
  }

  if (call.n === 1) return { spawn: { task: TASK } };

  if (call.n === 3) return { spawn: { task: FOLLOW_UP, resumeFrom: 1 } };

  return { text: "Done." };
}

test.describe("Subagent resume", () => {
  test("continues the same worker and shows only its new work", async ({
    page,
  }) => {
    const harness = await setupSubagentTest(page, spawnThenResume, {
      briefing: BRIEFING,
    });

    await sendChatMessage(page, "delegate the bass line");
    await expect(subagentCard(page)).toHaveCount(1);

    await sendChatMessage(page, "have it swing");
    await expect(subagentCard(page)).toHaveCount(2);

    // Both cards are worker 1 — resuming keeps the number, and the second says
    // so, since a resumed run reads nothing like a fresh spawn.
    const resumed = subagentCard(page).last();

    await expect(resumed).toContainText("done");
    await expect(resumed).toContainText("resumed");
    await expect(resumed).toContainText(FOLLOW_UP);
    await expect(subagentCard(page).first()).not.toContainText("resumed");

    // The card shows what THIS run added and not the earlier run's answer,
    // which already has a card of its own.
    await expandDisclosure(resumed);

    const transcript = subagentTranscript(resumed);

    await expandDisclosure(transcript);
    await expect(transcript).toContainText(FOLLOW_UP);
    await expect(transcript).toContainText(SECOND_REPLY);
    await expect(transcript).not.toContainText(FIRST_REPLY);

    // The worker, meanwhile, is re-seeded with everything it did before, so the
    // follow-up lands on top of its own context rather than a blank session.
    const workers = harness.calls.filter((c) => c.caller === "worker");

    expect(workers).toHaveLength(2);

    const second = workers[1] as LlmCall;

    expect(second.messagesJson).toContain(TASK);
    expect(second.messagesJson).toContain(FIRST_REPLY);
    expect(second.messagesJson).toContain(FOLLOW_UP);

    // A resume is a full worker run, so it is briefed like any other.
    expect(harness.briefings).toHaveLength(2);

    expectNoConsoleOutput(captured);
  });
});
