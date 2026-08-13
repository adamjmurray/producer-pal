// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Gate a one-shot callback that runs *after* the real write commits but
// *before* the autosave .then() runs, so a test can land an event (a delete, or
// a navigation) inside the exact window the save's guards defend against. Mock
// the whole conversation-db module (in this dedicated file only, so the main
// persistence suite keeps the real saveConversation) and pass everything else
// through.
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

import { loadConversation, saveConversation } from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import {
  renderVoicePersistenceWithHistory,
  resetConversationsDb,
  saveVoiceRecord,
  userTextItem,
  waitForAutosave,
  waitForEffects,
} from "./voice-persistence-test-helpers";

beforeEach(async () => {
  gate.afterSave = null;
  window.location.hash = "";
  await resetConversationsDb();
});

describe("useVoicePersistence autosave delete-during-write race", () => {
  it("does not adopt a just-deleted id when the delete lands during the write", async () => {
    // afterSave unarmed here → plain write
    const record = await saveVoiceRecord({
      voiceHistory: [userTextItem("seed")],
    });

    window.location.hash = record.id;

    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    expect(result.current.activeConversationId).toBe(record.id);

    // The next save (the autosave below) commits, then a delete lands before
    // the .then() runs — the exact window the guard covers.
    gate.afterSave = async () => {
      await result.current.deleteConversation(record.id);
    };

    rerender([userTextItem("a new turn")]);
    await waitForAutosave();

    // .then() must re-check canceledIds and bail: no stale re-adoption of the
    // deleted id, and the on-disk delete stands.
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.conversations).toHaveLength(0);
    expect(await loadConversation(record.id)).toBeUndefined();
  });
});

describe("useVoicePersistence autosave navigate-during-write race", () => {
  it("does not re-adopt a stale id when New lands during the first save", async () => {
    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();

    // New is clicked just as the first save of this brand-new conversation
    // commits — before its .then() can adopt the reserved id.
    gate.afterSave = async () => {
      result.current.startNewConversation();
    };

    rerender([userTextItem("a brand new turn")]);
    await waitForAutosave();

    // The fresh session must stay active (null), not be bumped back onto the
    // abandoned record's id.
    expect(result.current.activeConversationId).toBeNull();
  });

  it("does not re-adopt a stale id when a foreign record is selected during the first save", async () => {
    const textRecord = createTestRecord({ sessionType: "text" });

    await saveConversation(textRecord);

    const onForeignRecord = vi.fn();
    const { result, rerender } = renderVoicePersistenceWithHistory({
      onForeignRecord,
    });

    await waitForEffects();

    // Select a foreign (chat) record mid-write. switchConversation pins the
    // foreign id as active before handing off to the chat mode.
    gate.afterSave = async () => {
      await result.current.switchConversation(textRecord.id);
    };

    rerender([userTextItem("a brand new turn")]);
    await waitForAutosave();

    // The hash/active id must stay on the foreign record, not snap back to the
    // in-flight voice record.
    expect(result.current.activeConversationId).toBe(textRecord.id);
    expect(onForeignRecord).toHaveBeenCalled();
  });
});
