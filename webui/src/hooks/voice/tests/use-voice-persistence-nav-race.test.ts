// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same gate technique as the delete-race suite: run a one-shot callback *after*
// the autosave write commits but *before* the .then() runs, so a test can land
// a navigation (New / foreign-select) inside the exact window the adoption
// guard defends against. Mock conversation-db only in this file; pass the rest
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

import { saveConversation } from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import {
  renderVoicePersistenceWithHistory,
  resetConversationsDb,
  userTextItem,
  waitForEffects,
} from "./voice-persistence-test-helpers";

beforeEach(async () => {
  gate.afterSave = null;
  window.location.hash = "";
  await resetConversationsDb();
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
    await waitForEffects(800);

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
    await waitForEffects(800);

    // The hash/active id must stay on the foreign record, not snap back to the
    // in-flight voice record.
    expect(result.current.activeConversationId).toBe(textRecord.id);
    expect(onForeignRecord).toHaveBeenCalled();
  });
});
