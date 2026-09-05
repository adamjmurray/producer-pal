// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Gate a one-shot callback that runs *after* the real write commits but
// *before* the autosave .then() runs, so a test can land an event (a delete, or
// a navigation) inside the exact window the save's guards defend against. Mock
// the whole conversation-db module (in this dedicated file only, so the main
// persistence suite keeps the real saveConversation) and pass everything else
// through.
const gate = vi.hoisted(() => ({
  beforeSave: null as null | (() => Promise<void>),
  afterSave: null as null | (() => Promise<void>),
}));

vi.mock(import("#webui/lib/conversation-db"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    saveConversation: vi.fn(
      async (record: Parameters<typeof actual.saveConversation>[0]) => {
        if (gate.beforeSave) {
          const before = gate.beforeSave;

          gate.beforeSave = null;
          await before();
        }

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
  gate.beforeSave = null;
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

    // Start the delete once the autosave's write has committed but before it
    // has finished — the exact window the store's drain covers. Started, not
    // awaited: the delete waits on this very save, so awaiting it here would
    // deadlock the two.
    let deletion: Promise<void> | null = null;

    gate.afterSave = () => {
      deletion = result.current.deleteConversation(record.id);

      return Promise.resolve();
    };

    rerender([userTextItem("a new turn")]);
    await waitForAutosave();
    await act(async () => {
      await deletion;
    });

    // The delete drains the save, then removes the row it just wrote: no stale
    // re-adoption of the deleted id, and the on-disk delete stands.
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.conversations).toHaveLength(0);
    expect(await loadConversation(record.id)).toBeUndefined();
  });

  it("does not resurrect a wiped conversation whose first write had not landed", async () => {
    // The conversation has no row yet, so the write transaction has nothing to
    // notice a delete by. Only the drain covers this: the wipe has to wait for
    // the save it can already see.
    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();

    let wipe: Promise<void> | null = null;

    gate.beforeSave = () => {
      wipe = result.current.deleteAllConversations();

      return Promise.resolve();
    };

    rerender([userTextItem("a brand new turn")]);
    await waitForAutosave();
    await act(async () => {
      await wipe;
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
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
