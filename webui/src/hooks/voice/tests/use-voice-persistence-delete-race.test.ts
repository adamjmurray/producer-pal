// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { type RealtimeItem } from "@openai/agents/realtime";
import { renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Gate a one-shot callback that runs *after* the real write commits, so a test
// can simulate a delete landing during saveConversation's await window — the
// narrow race the autosave .then() guard defends against. Mock the whole
// conversation-db module (in this dedicated file only, so the main persistence
// suite keeps the real saveConversation) and pass everything else through.
const gate = vi.hoisted(() => ({
  afterSave: null as null | (() => Promise<void>),
}));

vi.mock(import("#webui/lib/conversation-db"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    saveConversation: vi.fn(
      async (record: Parameters<typeof actual.saveConversation>[0]) => {
        const result = await actual.saveConversation(record);

        if (gate.afterSave) {
          const fn = gate.afterSave;

          gate.afterSave = null;
          await fn();
        }

        return result;
      },
    ),
  };
});

import { useVoicePersistence } from "#webui/hooks/voice/use-voice-persistence";
import { loadConversation, saveConversation } from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import {
  resetConversationsDb,
  userTextItem,
  waitForEffects,
} from "./voice-persistence-test-helpers";

beforeEach(async () => {
  gate.afterSave = null;
  window.location.hash = "";
  await resetConversationsDb();
});

describe("useVoicePersistence autosave delete-during-write race", () => {
  it("does not adopt a just-deleted id when the delete lands during the write", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("seed")],
      messages: [],
    });

    await saveConversation(record); // afterSave unarmed → plain write
    window.location.hash = record.id;

    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    expect(result.current.activeConversationId).toBe(record.id);

    // The next save (the autosave below) commits, then a delete lands before
    // the .then() runs — the exact window the guard covers.
    gate.afterSave = async () => {
      await result.current.deleteConversation(record.id);
    };

    rerender({ history: [userTextItem("a new turn")] });
    await waitForEffects(800);

    // .then() must re-check canceledIds and bail: no stale re-adoption of the
    // deleted id, and the on-disk delete stands.
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.conversations).toHaveLength(0);
    expect(await loadConversation(record.id)).toBeUndefined();
  });
});
