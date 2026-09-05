// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import {
  waitForHookState,
  openGate,
} from "#webui/test-utils/async-test-helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as conversationDb from "#webui/lib/conversation-db";
import {
  listAllConversationSummaries,
  loadConversation,
} from "#webui/lib/conversation-db";
import { importConversations } from "#webui/lib/conversation-transfer";
import {
  type ConversationsResult,
  type ConversationsState,
  resetConversationsTestState,
  saveWithMessage,
  setupConversationsHook as setupHook,
  setupForkHook,
} from "./use-conversations-test-helpers";

/**
 * Spy on saveConversation so its next call blocks until released, then calls
 * through to the real implementation. Lets a test force a late autosave's DB
 * write to land *after* a delete completes — the resurrection window the store's
 * markDeleted()/drain() pair guards. With the fix in place the guarded save
 * never calls saveConversation, so the gate simply goes unused.
 * @returns release (let the gated write proceed) and restore (undo the spy)
 */
function gateNextSave(): { release: () => void; restore: () => void } {
  const original = conversationDb.saveConversation;
  const [gate, release] = openGate();
  const spy = vi
    .spyOn(conversationDb, "saveConversation")
    .mockImplementationOnce(async (record, options) => {
      await gate;

      return await original(record, options);
    });

  return { release, restore: () => spy.mockRestore() };
}

type HookHandle = Awaited<ReturnType<typeof setupHook>>;

/**
 * Drive the shared "a delete cancels a late autosave" race: gate the next save,
 * fire `deleteOp` concurrently with a late autosave, run `afterDelete` once the
 * delete settles, release the gated write, then run `afterRelease`.
 * @param handle - hook state/result from setupHook
 * @param deleteOp - the delete under test (returns its in-flight promise)
 * @param afterDelete - assertions to run once the delete settles
 * @param afterRelease - assertions to run after the gated late save lands
 */
async function expectLateAutosaveDropped(
  handle: HookHandle,
  deleteOp: () => Promise<void>,
  afterDelete: () => void | Promise<void>,
  afterRelease: () => void | Promise<void>,
): Promise<void> {
  const { state, result } = handle;
  const { release, restore } = gateNextSave();
  let deletePromise!: Promise<void>;
  let latePromise!: Promise<void>;

  await act(async () => {
    deletePromise = deleteOp();
    state.chatHistory = [{ role: "user", content: "late chunk" }];
    latePromise = result.current.saveCurrentConversation(Date.now());
    await deletePromise;
  });

  await afterDelete();

  await act(async () => {
    release();
    await latePromise;
  });

  await afterRelease();
  restore();
}

/**
 * Drive the bulk-delete race for an already-saved active conversation: save one
 * conversation, fire `bulkDelete` concurrently with a late autosave, and assert
 * the row is gone both when the delete settles and after the gated late write
 * lands (releasing it must not resurrect the cleared conversation).
 * @param bulkDelete - the bulk delete under test, read off the live hook result
 */
async function expectBulkDeleteDropsSavedLateAutosave(
  bulkDelete: (result: HookHandle["result"]) => Promise<void>,
): Promise<void> {
  const handle = await setupHook();
  const { state, result } = handle;

  await saveWithMessage(state, result);
  const savedId = result.current.activeConversationId!;

  await expectLateAutosaveDropped(
    handle,
    () => bulkDelete(result),
    async () => {
      expect(result.current.conversations).toHaveLength(0);
      expect(await loadConversation(savedId)).toBeUndefined();
    },
    async () => expect(await loadConversation(savedId)).toBeUndefined(),
  );
}

/**
 * Drive the bulk-delete race for a never-saved conversation (activeConversationId
 * === null, its id minted lazily inside the teardown autosave): fire `bulkDelete`
 * concurrently with that late autosave and assert no zombie row survives, either
 * when the delete settles or after the gated late write lands.
 * @param bulkDelete - the bulk delete under test, read off the live hook result
 */
async function expectBulkDeleteDropsNeverSavedLateAutosave(
  bulkDelete: (result: HookHandle["result"]) => Promise<void>,
): Promise<void> {
  const handle = await setupHook();
  const { result } = handle;

  expect(result.current.activeConversationId).toBeNull();

  await expectLateAutosaveDropped(
    handle,
    () => bulkDelete(result),
    () => expect(result.current.conversations).toHaveLength(0),
    () => expect(result.current.conversations).toHaveLength(0),
  );
}

/**
 * Drive a delete against an active conversation with a fork signal raised.
 *
 * Stop deliberately keeps that signal, so the teardown autosave the delete
 * triggers still arrives wanting to branch. Branching mints a fresh id the
 * delete's own marking can't cover, so the save wrote a sibling of the row being
 * deleted — and moved the active id onto it, which skipped the delete's own
 * clear. The conversation was gone but the view still showed it.
 * @param deleteOp - the delete under test, given the hook result and the saved id
 */
async function expectForkDroppedOnDelete(
  deleteOp: (result: HookHandle["result"], savedId: string) => Promise<void>,
): Promise<void> {
  const { props, state, result, pendingForkRef } = await setupForkHook();

  await saveWithMessage(state, result, "original");

  const savedId = result.current.activeConversationId!;

  pendingForkRef.current = { anchorIndex: 0 };

  await expectLateAutosaveDropped(
    { props, state, result },
    () => deleteOp(result, savedId),
    async () => {
      expect(await loadConversation(savedId)).toBeUndefined();
      expect(result.current.activeConversationId).toBeNull();
      expect(props.clearConversation).toHaveBeenCalled();
    },
    // No sibling branched off the row that just went away.
    async () => expect(await listAllConversationSummaries()).toHaveLength(0),
  );
}

/**
 * Hold the next row removal open until the returned release is called.
 * @param method - The conversation-db delete the sweep under test runs
 * @returns release (let the removal finish) and restore (undo the spy)
 */
function gateNextDelete(
  method: "deleteConversation" | "deleteUnbookmarkedConversations",
): { release: () => void; restore: () => void } {
  const original = conversationDb[method] as (id?: string) => Promise<void>;
  const [gate, release] = openGate();
  const spy = vi
    .spyOn(conversationDb, method)
    .mockImplementationOnce(async (id?: string) => {
      await gate;

      await original(id);
    });

  return { release, restore: () => spy.mockRestore() };
}

/**
 * Save one conversation, start another and save that too.
 * @param state - Mock chat-history state
 * @param result - Hook result ref
 * @returns The two conversation ids, in the order they were saved
 */
async function saveTwo(
  state: ConversationsState,
  result: ConversationsResult,
): Promise<[string, string]> {
  await saveWithMessage(state, result, "first");
  const first = result.current.activeConversationId!;

  await act(() => Promise.resolve(result.current.startNewConversation()));
  await saveWithMessage(state, result, "second");

  return [first, result.current.activeConversationId!];
}

describe("useConversations delete/save races", () => {
  beforeEach(resetConversationsTestState);

  it("drops a late autosave enqueued after a single delete begins", async () => {
    // F1: handleDelete stops the stream, whose teardown fires one more autosave
    // for the still-active id *after* deleteConversation drained the save chain.
    const handle = await setupHook();
    const { state, result } = handle;

    await saveWithMessage(state, result);
    const savedId = result.current.activeConversationId!;

    expect(await loadConversation(savedId)).toBeDefined();

    // The stream-teardown autosave, enqueued after the delete captured the
    // chain, with its write gated so it lands after the row is removed.
    // Releasing the late save must not resurrect the deleted row.
    await expectLateAutosaveDropped(
      handle,
      () => result.current.deleteConversation(savedId),
      async () => {
        expect(await loadConversation(savedId)).toBeUndefined();
        expect(result.current.conversations).toHaveLength(0);
      },
      async () => expect(await loadConversation(savedId)).toBeUndefined(),
    );
  });

  it("drops a pending fork when the active conversation is deleted", async () => {
    await expectForkDroppedOnDelete((result, savedId) =>
      result.current.deleteConversation(savedId),
    );
  });

  it("drops a pending fork when delete-all clears the conversation", async () => {
    await expectForkDroppedOnDelete((result) =>
      result.current.deleteAllConversations(),
    );
  });

  it("deleteAll drops a late autosave for the just-cleared conversation", async () => {
    // F2: bulk deletes had no drain and no guard. The active conversation's
    // teardown autosave must not survive the clear.
    await expectBulkDeleteDropsSavedLateAutosave((result) =>
      result.current.deleteAllConversations(),
    );
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
    await expectBulkDeleteDropsSavedLateAutosave((result) =>
      result.current.deleteUnbookmarkedConversations(),
    );
  });

  it("deleteUnbookmarked keeps a bookmarked conversation and does not drop its autosave", async () => {
    // The surviving (bookmarked) active conversation must NOT be canceled — its
    // in-flight save has to land, so its latest content isn't lost.
    const handle = await setupHook();
    const { state, result } = handle;

    await saveWithMessage(state, result, "original");
    const savedId = result.current.activeConversationId!;

    await act(async () => {
      await result.current.toggleBookmark(savedId);
    });

    await expectLateAutosaveDropped(
      handle,
      () => result.current.deleteUnbookmarkedConversations(),
      () => expect(result.current.conversations).toHaveLength(1),
      // Its autosave wrote through — the bookmarked conversation is still present.
      async () => expect(await loadConversation(savedId)).toBeDefined(),
    );
  });

  it("deleteAll drops a late autosave for a never-saved conversation (activeId null)", async () => {
    // G2: a brand-new chat streaming its first turn has activeConversationId ===
    // null; its id is minted lazily inside the teardown autosave. Without
    // reserving that id the bulk delete can't cancel it, so the late save writes
    // a surviving zombie row after the store was cleared.
    //
    // The gated late save is the stream-teardown autosave for the never-saved
    // conversation, enqueued after the bulk delete reserved its pending-new id.
    await expectBulkDeleteDropsNeverSavedLateAutosave((result) =>
      result.current.deleteAllConversations(),
    );
  });

  it("deleteUnbookmarked drops a late autosave for a never-saved conversation (activeId null)", async () => {
    // G2 sibling: a never-saved conversation is implicitly unbookmarked, so the
    // unbookmarked bulk delete sweeps it too and must cancel its lazily-minted id.
    await expectBulkDeleteDropsNeverSavedLateAutosave((result) =>
      result.current.deleteUnbookmarkedConversations(),
    );
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
    // F5: deleteConversation marks the slot deleted to block a resurrecting
    // late save, and that marking used to be one-way. Undo restores the row
    // under the same id (raw saveConversation, bypassing the guard); without
    // clearing the mark, every later autosave for it bailed, silently dropping
    // post-undo messages. Undo has to make the slot saveable again.
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
    await waitForHookState(async () =>
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
  it("re-enables autosave after a deleted conversation is re-imported", async () => {
    // The deleted marking used to be one-way, and export/import keeps ids: a
    // deleted conversation that came back through import was silently
    // unsaveable for the rest of the session. Opening it clears the marking.
    const { state, result } = await setupHook();

    await saveWithMessage(state, result, "original");

    const savedId = result.current.activeConversationId!;
    const record = (await loadConversation(savedId))!;
    const backup = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      conversations: [{ ...record, updatedAt: record.updatedAt + 1 }],
    });

    await act(async () => {
      await result.current.deleteConversation(savedId);
    });
    expect(await loadConversation(savedId)).toBeUndefined();

    await act(async () => {
      await importConversations(backup);
    });
    expect(await loadConversation(savedId)).toBeDefined();

    await act(async () => {
      await result.current.switchConversation(savedId);
    });
    state.chatHistory = [
      { role: "user", content: "original" },
      { role: "user", content: "after import" },
    ];
    await act(async () => {
      await result.current.saveCurrentConversation(Date.now());
    });

    const afterImport = await loadConversation(savedId);

    expect(afterImport?.messages).toHaveLength(2);
  });

  it("re-enables autosave when the delete itself failed", async () => {
    // The tombstone goes up before the DB work. If that work throws the row is
    // still listed, so the tombstone has to come back down or the conversation
    // is permanently unsaveable.
    const { state, result } = await setupHook();

    await saveWithMessage(state, result, "original");

    const savedId = result.current.activeConversationId!;
    const spy = vi
      .spyOn(conversationDb, "deleteConversation")
      .mockRejectedValueOnce(new Error("IDB is having a day"));

    await act(async () => {
      await expect(result.current.deleteConversation(savedId)).rejects.toThrow(
        "IDB is having a day",
      );
    });
    spy.mockRestore();
    expect(await loadConversation(savedId)).toBeDefined();

    state.chatHistory = [
      { role: "user", content: "original" },
      { role: "user", content: "after the failed delete" },
    ];
    await act(async () => {
      await result.current.saveCurrentConversation(Date.now());
    });

    const afterFailedDelete = await loadConversation(savedId);

    expect(afterFailedDelete?.messages).toHaveLength(2);
  });

  it("deleteAll drops the pending undo so the banner can't un-wipe a row", async () => {
    // The undo banner never auto-expires, so a "Deleted X / Undo" left over
    // from a single delete used to sit through a wipe-everything and put X back.
    const { state, result } = await setupHook();

    await saveWithMessage(state, result, "keeper");

    const savedId = result.current.activeConversationId!;

    await act(async () => {
      await result.current.deleteConversation(savedId);
    });
    expect(result.current.notification?.action?.label).toBe("Undo");

    await act(async () => {
      await result.current.deleteAllConversations();
    });

    expect(result.current.notification).toBeNull();
    expect(await listAllConversationSummaries()).toHaveLength(0);
  });

  it("deleteUnbookmarked drops only the undos its sweep would have taken", async () => {
    const { state, result } = await setupHook();

    // A bookmarked conversation deleted by hand: the sweep would have spared
    // it, so its undo survives and still restores.
    await saveWithMessage(state, result, "bookmarked");

    const keptId = result.current.activeConversationId!;

    await act(async () => {
      await result.current.toggleBookmark(keptId);
    });
    await act(async () => {
      await result.current.deleteConversation(keptId);
    });

    await act(async () => {
      await result.current.deleteUnbookmarkedConversations();
    });

    expect(result.current.notification?.action?.label).toBe("Undo");

    await act(async () => {
      result.current.notification!.action!.onClick();
    });
    await waitForHookState(async () =>
      expect(await loadConversation(keptId)).toBeDefined(),
    );
  });
});

// A delete decides whether to tear the view down after its awaits, so the
// answer has to come from the conversation that is live by then: the user can
// open another one while the delete runs, and clearing the view then throws
// away what they just opened.
describe("useConversations delete vs. switch", () => {
  beforeEach(resetConversationsTestState);

  it("keeps the conversation opened while the delete was running", async () => {
    const { state, result } = await setupHook();
    const [doomed, opened] = await saveTwo(state, result);

    await act(() => result.current.switchConversation(doomed));

    const { release, restore } = gateNextDelete("deleteConversation");
    let deleting!: Promise<void>;

    await act(async () => {
      deleting = result.current.deleteConversation(doomed);
      await result.current.switchConversation(opened);
      release();
      await deleting;
    });

    expect(result.current.activeConversationId).toBe(opened);
    expect(await conversationDb.loadConversation(doomed)).toBeUndefined();
    restore();
  });

  it("keeps a bookmarked conversation opened while a sweep was running", async () => {
    const { state, result } = await setupHook();
    const [doomed, opened] = await saveTwo(state, result);

    await act(() => result.current.toggleBookmark(opened));
    await act(() => result.current.switchConversation(doomed));

    const { release, restore } = gateNextDelete(
      "deleteUnbookmarkedConversations",
    );
    let sweeping!: Promise<void>;

    await act(async () => {
      sweeping = result.current.deleteUnbookmarkedConversations();
      await result.current.switchConversation(opened);
      release();
      await sweeping;
    });

    expect(result.current.activeConversationId).toBe(opened);
    restore();
  });
});
