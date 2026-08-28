// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

// A delete decides whether to start a new session after its awaits, so the
// answer has to come from the conversation that is live by then. The user can
// open another one while the delete runs.

import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as conversationDb from "#webui/lib/conversation-db";
import { openGate } from "#webui/test-utils/async-test-helpers";
import {
  renderVoicePersistence,
  resetConversationsDb,
  saveVoiceRecord,
  userTextItem,
  waitForEffects,
} from "./voice-persistence-test-helpers";

beforeEach(async () => {
  window.location.hash = "";
  await resetConversationsDb();
});

describe("useVoicePersistence delete vs. switch", () => {
  it("keeps the conversation opened while the delete was running", async () => {
    const doomed = await saveVoiceRecord({
      voiceHistory: [userTextItem("doomed")],
    });
    const opened = await saveVoiceRecord({
      id: "opened",
      voiceHistory: [userTextItem("opened")],
    });

    window.location.hash = doomed.id;

    const { result } = renderVoicePersistence();

    await waitForEffects();
    expect(result.current.activeConversationId).toBe(doomed.id);

    const original = conversationDb.deleteConversation;
    const [gate, release] = openGate();
    const spy = vi
      .spyOn(conversationDb, "deleteConversation")
      .mockImplementationOnce(async (id: string) => {
        await gate;

        return await original(id);
      });
    let deleting!: Promise<void>;

    await act(async () => {
      deleting = result.current.deleteConversation(doomed.id);
      await result.current.switchConversation(opened.id);
      release();
      await deleting;
    });

    expect(result.current.activeConversationId).toBe(opened.id);
    expect(await conversationDb.loadConversation(doomed.id)).toBeUndefined();
    spy.mockRestore();
  });
});
