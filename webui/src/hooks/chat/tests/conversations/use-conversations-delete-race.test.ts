// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as conversationDb from "#webui/lib/conversation-db";
import { loadConversation } from "#webui/lib/conversation-db";
import {
  resetConversationsTestState,
  saveWithMessage,
  setupConversationsHook as setupHook,
} from "./use-conversations-test-helpers";

/**
 * Spy on saveConversation so its next call blocks until released, then calls
 * through to the real implementation. Lets a test force a late autosave's DB
 * write to land *after* a delete completes — the resurrection window guarded by
 * canceledIdsRef. With the fix in place the guarded save never calls
 * saveConversation, so the gate simply goes unused.
 * @returns release (let the gated write proceed) and restore (undo the spy)
 */
function gateNextSave(): { release: () => void; restore: () => void } {
  const original = conversationDb.saveConversation;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi
    .spyOn(conversationDb, "saveConversation")
    .mockImplementationOnce(async (record, protectedIds) => {
      await gate;

      return await original(record, protectedIds);
    });

  return { release, restore: () => spy.mockRestore() };
}

describe("useConversations delete/save races", () => {
  beforeEach(resetConversationsTestState);

  it("drops a late autosave enqueued after a single delete begins", async () => {
    // F1: handleDelete stops the stream, whose teardown fires one more autosave
    // for the still-active id *after* deleteConversation drained the save chain.
    const { state, result } = await setupHook();

    await saveWithMessage(state, result);
    const savedId = result.current.activeConversationId!;

    expect(await loadConversation(savedId)).toBeDefined();

    const { release, restore } = gateNextSave();
    let deletePromise!: Promise<void>;
    let latePromise!: Promise<void>;

    await act(async () => {
      deletePromise = result.current.deleteConversation(savedId);
      // The stream-teardown autosave, enqueued after the delete captured the
      // chain, with its write gated so it lands after the row is removed.
      state.chatHistory = [{ role: "user", content: "late chunk" }];
      latePromise = result.current.saveCurrentConversation(Date.now());
      await deletePromise;
    });

    expect(await loadConversation(savedId)).toBeUndefined();
    expect(result.current.conversations).toHaveLength(0);

    // Releasing the late save must not resurrect the deleted row.
    await act(async () => {
      release();
      await latePromise;
    });

    expect(await loadConversation(savedId)).toBeUndefined();
    restore();
  });

  it("deleteAll drops a late autosave for the just-cleared conversation", async () => {
    // F2: bulk deletes had no drain and no guard. The active conversation's
    // teardown autosave must not survive the clear.
    const { state, result } = await setupHook();

    await saveWithMessage(state, result);
    const savedId = result.current.activeConversationId!;

    const { release, restore } = gateNextSave();
    let bulkPromise!: Promise<void>;
    let latePromise!: Promise<void>;

    await act(async () => {
      bulkPromise = result.current.deleteAllConversations();
      state.chatHistory = [{ role: "user", content: "late chunk" }];
      latePromise = result.current.saveCurrentConversation(Date.now());
      await bulkPromise;
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(await loadConversation(savedId)).toBeUndefined();

    await act(async () => {
      release();
      await latePromise;
    });

    expect(await loadConversation(savedId)).toBeUndefined();
    restore();
  });

  it("deleteAll is safe with no active conversation", async () => {
    // Covers the no-active-id path: a saved conversation with the active id
    // already cleared still gets removed, and nothing throws.
    const { state, result } = await setupHook();

    await saveWithMessage(state, result);
    const savedId = result.current.activeConversationId!;

    await act(async () => {
      result.current.startNewConversation();
    });
    expect(result.current.activeConversationId).toBeNull();

    await act(async () => {
      await result.current.deleteAllConversations();
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(await loadConversation(savedId)).toBeUndefined();
  });

  it("deleteUnbookmarked drops a late autosave for the deleted active conversation", async () => {
    const { state, result } = await setupHook();

    await saveWithMessage(state, result);
    const savedId = result.current.activeConversationId!;

    const { release, restore } = gateNextSave();
    let bulkPromise!: Promise<void>;
    let latePromise!: Promise<void>;

    await act(async () => {
      bulkPromise = result.current.deleteUnbookmarkedConversations();
      state.chatHistory = [{ role: "user", content: "late chunk" }];
      latePromise = result.current.saveCurrentConversation(Date.now());
      await bulkPromise;
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(await loadConversation(savedId)).toBeUndefined();

    await act(async () => {
      release();
      await latePromise;
    });

    expect(await loadConversation(savedId)).toBeUndefined();
    restore();
  });

  it("deleteUnbookmarked keeps a bookmarked conversation and does not drop its autosave", async () => {
    // The surviving (bookmarked) active conversation must NOT be canceled — its
    // in-flight save has to land, so its latest content isn't lost.
    const { state, result } = await setupHook();

    await saveWithMessage(state, result, "original");
    const savedId = result.current.activeConversationId!;

    await act(async () => {
      await result.current.toggleBookmark(savedId);
    });

    const { release, restore } = gateNextSave();
    let bulkPromise!: Promise<void>;
    let latePromise!: Promise<void>;

    await act(async () => {
      bulkPromise = result.current.deleteUnbookmarkedConversations();
      state.chatHistory = [{ role: "user", content: "updated" }];
      latePromise = result.current.saveCurrentConversation(Date.now());
      await bulkPromise;
    });

    expect(result.current.conversations).toHaveLength(1);

    await act(async () => {
      release();
      await latePromise;
    });

    // Its autosave wrote through — the bookmarked conversation is still present.
    expect(await loadConversation(savedId)).toBeDefined();
    restore();
  });

  it("deleteAll drops a late autosave for a never-saved conversation (activeId null)", async () => {
    // G2: a brand-new chat streaming its first turn has activeConversationId ===
    // null; its id is minted lazily inside the teardown autosave. Without
    // reserving that id the bulk delete can't cancel it, so the late save writes
    // a surviving zombie row after the store was cleared.
    const { state, result } = await setupHook();

    expect(result.current.activeConversationId).toBeNull();

    const { release, restore } = gateNextSave();
    let bulkPromise!: Promise<void>;
    let latePromise!: Promise<void>;

    await act(async () => {
      bulkPromise = result.current.deleteAllConversations();
      // The stream-teardown autosave for the never-saved conversation, enqueued
      // after the bulk delete reserved its pending-new id.
      state.chatHistory = [{ role: "user", content: "late chunk" }];
      latePromise = result.current.saveCurrentConversation(Date.now());
      await bulkPromise;
    });

    expect(result.current.conversations).toHaveLength(0);

    await act(async () => {
      release();
      await latePromise;
    });

    expect(result.current.conversations).toHaveLength(0);
    restore();
  });

  it("deleteUnbookmarked drops a late autosave for a never-saved conversation (activeId null)", async () => {
    // G2 sibling: a never-saved conversation is implicitly unbookmarked, so the
    // unbookmarked bulk delete sweeps it too and must cancel its lazily-minted id.
    const { state, result } = await setupHook();

    expect(result.current.activeConversationId).toBeNull();

    const { release, restore } = gateNextSave();
    let bulkPromise!: Promise<void>;
    let latePromise!: Promise<void>;

    await act(async () => {
      bulkPromise = result.current.deleteUnbookmarkedConversations();
      state.chatHistory = [{ role: "user", content: "late chunk" }];
      latePromise = result.current.saveCurrentConversation(Date.now());
      await bulkPromise;
    });

    expect(result.current.conversations).toHaveLength(0);

    await act(async () => {
      release();
      await latePromise;
    });

    expect(result.current.conversations).toHaveLength(0);
    restore();
  });

  it("re-enables a brand-new save after a bulk delete reserved and canceled an id", async () => {
    // F5-class lifecycle guard: the pending-new id the bulk delete reserves and
    // cancels must be cleared (via clearActiveId), or the NEXT brand-new
    // conversation reuses the canceled id and its save silently bails. Prove a
    // fresh conversation still saves after a delete-all.
    const { state, result } = await setupHook();

    await act(async () => {
      await result.current.deleteAllConversations();
    });

    state.chatHistory = [{ role: "user", content: "new after delete-all" }];
    await act(async () => {
      await result.current.saveCurrentConversation(Date.now());
    });

    const id = result.current.activeConversationId;

    expect(id).not.toBeNull();
    expect(await loadConversation(id!)).toBeDefined();
    expect(result.current.conversations).toHaveLength(1);
  });

  it("re-enables autosave after a deleted conversation is undone", async () => {
    // F5: deleteConversation marks the id canceled to block a resurrecting late
    // save, but the flag was add-only. Undo restores the row under the same id
    // (raw saveConversation, bypassing the guard); without un-canceling, every
    // later autosave for it bailed at the guard, silently dropping post-undo
    // messages. Undo must clear the flag so saving works again.
    const { state, result } = await setupHook();

    await saveWithMessage(state, result, "original");
    const savedId = result.current.activeConversationId!;

    // Delete the active conversation — adds savedId to the canceled set.
    await act(async () => {
      await result.current.deleteConversation(savedId);
    });
    expect(await loadConversation(savedId)).toBeUndefined();

    // Undo via the banner. action.onClick fires `void undo()`, so wait for the
    // restore to land in the DB before continuing.
    await act(async () => {
      result.current.notification!.action!.onClick();
    });
    await waitFor(async () =>
      expect(await loadConversation(savedId)).toBeDefined(),
    );

    // Reopen the restored conversation and keep chatting: the new autosave must
    // reach the DB, not bail at the now-cleared canceled-id guard.
    await act(async () => {
      await result.current.switchConversation(savedId);
    });
    state.chatHistory = [
      { role: "user", content: "original" },
      { role: "user", content: "after undo" },
    ];
    await act(async () => {
      await result.current.saveCurrentConversation(Date.now());
    });

    const reloaded = await loadConversation(savedId);

    expect(reloaded?.messages).toHaveLength(2);
  });
});
