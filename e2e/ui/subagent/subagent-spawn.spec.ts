// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A spawn, driven end to end: the orchestrator calls spawn_subagent, a real
// nested worker session runs against the scripted endpoint, and its result comes
// back as a card. Covers the three things only a whole-app run can show — the
// briefing replacing the worker's ppal-connect, the transcript reaching the UI
// but never the orchestrator's context, and both surviving a reload.

import { expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  openHistoryPanel,
  readConversationsFromDb,
  setupConsoleCapture,
} from "../ui-test-helpers";
import {
  BRIEFING_HEADER,
  DISABLED_TOOLS_HEADER,
  type LlmCall,
  type LlmReply,
  SPAWN_TOOL,
  expandDisclosure,
  sendChatMessage,
  setupSubagentTest,
  subagentCard,
  subagentTranscript,
} from "./subagent-test-helpers";

const captured = setupConsoleCapture();

const TASK = "write a bass line on the Bass track";
const WORKER_REPLY = "Wrote a four-bar bass line on Bass.";
const FINAL_REPLY = "The bass line is ready.";
const BRIEFING = "## Ableton Live Set\n\n120 bpm, 4/4, 3 tracks";

/** One spawn: delegate, let the worker answer, then report back. */
function oneSpawn(call: LlmCall): LlmReply {
  if (call.caller === "worker") return { text: WORKER_REPLY };

  return call.afterToolResult
    ? { text: FINAL_REPLY }
    : { spawn: { task: TASK } };
}

test.describe("Subagent spawn", () => {
  test("runs a worker and shows its result on the card", async ({ page }) => {
    await setupSubagentTest(page, oneSpawn, { briefing: BRIEFING });
    await sendChatMessage(page, "delegate the bass line");

    await expect(page.getByText(FINAL_REPLY)).toBeVisible();

    const card = subagentCard(page);

    await expect(card).toContainText("subagent 1");
    await expect(card).toContainText(TASK);
    await expect(card).toContainText("done");

    // The worker's final message is the card's return value, with the
    // [subagent N] label the model needs stripped — the header shows the number.
    await expandDisclosure(card);
    await expect(card).toContainText(WORKER_REPLY);
    await expect(card).not.toContainText("[subagent 1]");

    // Deep-dive tier: the worker's own turns, task first.
    const transcript = subagentTranscript(card);

    await expandDisclosure(transcript);
    await expect(transcript).toContainText(TASK);
    await expect(transcript).toContainText(WORKER_REPLY);

    expectNoConsoleOutput(captured);
  });

  test("briefs the worker instead of letting it connect", async ({ page }) => {
    const harness = await setupSubagentTest(page, oneSpawn, {
      briefing: BRIEFING,
    });

    await sendChatMessage(page, "delegate the bass line");
    await expect(page.getByText(FINAL_REPLY)).toBeVisible();

    expect(harness.briefings).toHaveLength(1);

    const headers = harness.briefings[0] as Record<string, string>;

    // The custom header is the load-bearing half of the CSRF guard, and the
    // profile rides the same disabled-tools header the worker's MCP calls send.
    expect(headers[BRIEFING_HEADER]).toBeDefined();
    expect(headers[DISABLED_TOOLS_HEADER]).toContain("ppal-context");
    expect(headers[DISABLED_TOOLS_HEADER]).toContain("ppal-connect");

    const worker = harness.calls.find((c) => c.caller === "worker") as LlmCall;

    expect(worker.system).toContain(BRIEFING);
    // The briefing replaces the connect call it used to make, and no worker
    // ever gets to spawn its own.
    expect(worker.toolNames).not.toContain("ppal-connect");
    expect(worker.toolNames).not.toContain(SPAWN_TOOL);

    expectNoConsoleOutput(captured);
  });

  test("falls back to a connecting worker when the briefing fails", async ({
    page,
  }) => {
    const harness = await setupSubagentTest(page, oneSpawn, { briefing: null });

    await sendChatMessage(page, "delegate the bass line");
    await expect(page.getByText(FINAL_REPLY)).toBeVisible();

    expect(harness.briefings).toHaveLength(1);

    const worker = harness.calls.find((c) => c.caller === "worker") as LlmCall;

    // Live unreachable: the worker gets ppal-connect back rather than starting
    // out knowing nothing about the Set it is about to edit.
    expect(worker.toolNames).toContain("ppal-connect");
    expect(worker.toolNames).not.toContain(SPAWN_TOOL);
    await expect(subagentCard(page)).toContainText("done");

    // No console-output check here: the 502 this test serves is its own
    // stimulus, and the browser logs every failed request.
  });

  test("keeps the transcript out of the model's context and in the record", async ({
    page,
  }) => {
    const harness = await setupSubagentTest(page, oneSpawn, {
      briefing: BRIEFING,
    });

    await sendChatMessage(page, "delegate the bass line");
    await expect(page.getByText(FINAL_REPLY)).toBeVisible();

    // The orchestrator sees the labeled final message and nothing else the
    // worker did — the whole point of stashing the transcript UI-side.
    const followUp = harness.calls.find(
      (c) => c.caller === "orchestrator" && c.afterToolResult,
    ) as LlmCall;

    expect(followUp.messagesJson).toContain("[subagent 1]");
    expect(followUp.messagesJson).toContain(WORKER_REPLY);
    expect(followUp.messagesJson).not.toContain(BRIEFING);

    // …while the conversation record keeps it, so the card can be rebuilt.
    await expect
      .poll(async () => (await readConversationsFromDb(page)).length)
      .toBe(1);

    const [record] = await readConversationsFromDb(page);

    expect(JSON.stringify(record)).toContain("subagentTranscript");

    // Restored from IndexedDB, the card and its transcript render again.
    await page.reload();
    await openHistoryPanel(page);
    await page.getByTestId("conversation-item").first().click();

    const card = subagentCard(page);

    await expect(card).toContainText("subagent 1");
    await expandDisclosure(card);

    const transcript = subagentTranscript(card);

    await expandDisclosure(transcript);
    await expect(transcript).toContainText(WORKER_REPLY);

    expectNoConsoleOutput(captured);
  });
});
