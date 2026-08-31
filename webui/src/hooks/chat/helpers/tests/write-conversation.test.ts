// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeConversation } from "#webui/hooks/chat/helpers/conversations/write-conversation";
import {
  DEFAULT_META,
  createConversationStore,
} from "#webui/lib/conversation-store";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import { getConversationDb, resetDbCache } from "#webui/lib/conversation-db";

/** A no-op SaveNotifier, so tests only assert the calls they care about. */
function fakeLimit() {
  return {
    showSaveRefused: vi.fn(),
    showLimitNotification: vi.fn(),
    showSaveError: vi.fn(),
  };
}

describe("writeConversation", () => {
  beforeEach(async () => {
    await resetDbCache();

    const db = await getConversationDb();

    await db.clear("conversations");
  });

  it("bails without writing when a dead-claim recovery finds the conversation gone", async () => {
    // A dead-claim recovery (writeConversation's own !stillLive() branch)
    // reads deadForkAttempts before this exact id has ever failed before —
    // an empty map, unlike every hook-level race test, which always seeds it
    // via a prior failure. And the conversation can be deleted in the gap
    // between the claim dying and this recovery running.
    const store = createConversationStore();
    const trunk = store.beginSave(false)!;

    store.markPersisted(trunk, createTestRecord({ id: trunk.id }));

    const fork = store.beginSave(true)!;
    const followUp = store.beginSave(false)!;

    fork.rollback();
    store.markDeleted();

    const pendingForkRef = { current: { anchorIndex: 0 } };
    const limit = fakeLimit();
    const refreshList = vi.fn().mockResolvedValue(undefined);

    await writeConversation({
      snapshot: followUp,
      fork: null,
      refs: { id: followUp.id, ...DEFAULT_META },
      chatHistory: [{ role: "user", content: "hi" }],
      updatedAt: undefined,
      store,
      pendingForkRef,
      deadForkAttempts: new Map(),
      limit,
      refreshList,
    });

    // Took over the still-armed retry signal, but beginSave refused once the
    // conversation was marked deleted — nothing left to save under.
    expect(pendingForkRef.current).toBeNull();
    expect(limit.showSaveError).not.toHaveBeenCalled();
    expect(limit.showSaveRefused).not.toHaveBeenCalled();
    expect(refreshList).not.toHaveBeenCalled();
  });
});
