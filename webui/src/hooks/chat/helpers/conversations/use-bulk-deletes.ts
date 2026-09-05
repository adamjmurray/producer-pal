// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type ConversationStore } from "#webui/lib/conversation-store";
import {
  type ConversationRecord,
  deleteAllConversations as dbDeleteAllConversations,
  deleteUnbookmarkedConversations as dbDeleteUnbookmarkedConversations,
  loadConversation,
} from "#webui/lib/conversation-db";

/** The useConversations state the bulk deletes read and write. */
export interface BulkDeleteParams {
  store: ConversationStore;
  clearConversation: () => void;
  refreshList: () => Promise<void>;
  /** Drops a pending fork signal so a teardown save can't branch off a doomed record. */
  dropPendingFork: () => void;
  /** Drops the pending undos this sweep has just invalidated. */
  dropUndoable: (shouldDrop: (record: ConversationRecord) => boolean) => void;
}

export interface BulkDeletes {
  deleteAllConversations: () => Promise<void>;
  deleteUnbookmarkedConversations: () => Promise<void>;
}

/**
 * The delete-everything and delete-unbookmarked sweeps.
 *
 * Both mirror deleteConversation: take the live conversation out of play, drain
 * the queued saves, sweep, then clear the view. The caller stops the stream
 * first, so the two save producers are the save already in flight (the drain
 * covers it) and the stream-teardown autosave (which can't start on a
 * conversation marked deleted). A brand-new chat streaming its first turn is
 * covered by the same mark: the store minted its id when the conversation began
 * rather than inside the save, so there is nothing left to reserve by hand.
 *
 * Each sweep also drops the pending undos it invalidates. The undo banner never
 * auto-expires, so a "Deleted X / Undo" left over from a single delete would
 * otherwise sit there after a wipe and put X back on one click.
 *
 * @param params - The store and callbacks these sweeps operate on
 * @returns The two bulk-delete handlers
 */
export function useBulkDeletes(params: BulkDeleteParams): BulkDeletes {
  const {
    store,
    clearConversation,
    refreshList,
    dropPendingFork,
    dropUndoable,
  } = params;

  /**
   * Run one bulk-delete sweep.
   * @param sweepsLive - Whether the live conversation is in scope for this
   * sweep, asked once before the wipe to decide the protective mark below.
   * What actually happens to the live conversation is read back from the DB
   * afterward rather than asked again: a bookmark toggled while the mark is
   * up can't reach metaRef, so a re-derived answer would get it wrong.
   * @param survivesSweep - Whether a record outlives this sweep. The undo
   * banner never auto-expires, so a pending undo for a record the sweep would
   * have taken anyway is dropped rather than left offering to put it back.
   * @param removeRows - Clears the matching rows from the DB
   */
  const sweep = useCallback(
    async (
      sweepsLive: () => boolean,
      survivesSweep: (record: ConversationRecord) => boolean,
      removeRows: () => Promise<void>,
    ): Promise<void> => {
      let undoMark: (() => void) | null = null;

      if (sweepsLive()) {
        dropPendingFork();
        undoMark = store.markDeleted();
      }

      await store.drain();

      try {
        await removeRows();
      } catch (error) {
        undoMark?.();
        throw error;
      }

      // Dropped only once the rows are really gone. An undo record is the only
      // copy left of a conversation the user deleted, and dropping it is
      // irreversible, so a sweep that threw must not take it down with it.
      dropUndoable((record) => !survivesSweep(record));

      // Ground truth for whichever conversation is live now, not a re-derived
      // predicate — see sweepsLive's doc above for why.
      const liveId = store.liveId();
      let liveRowSurvived: boolean;

      try {
        liveRowSurvived = (await loadConversation(liveId)) != null;
      } catch (error) {
        // Rows are already gone or kept — this only failed to confirm which.
        // Leaving a live view alone on an unproven guess is safer than
        // clearing it on one, so treat the failure as "survived". The cost:
        // undoMark restores a slot markDeleted() tore down, so the next
        // autosave can write the just-deleted row right back.
        console.error(
          "Failed to confirm live conversation survived the sweep",
          error,
        );
        liveRowSurvived = true;
      }

      if (liveRowSurvived) {
        undoMark?.();
      } else {
        clearConversation();
        store.reset();
      }

      await refreshList();
    },
    [store, clearConversation, refreshList, dropPendingFork, dropUndoable],
  );

  const deleteAllConversations = useCallback(
    () =>
      sweep(
        () => true,
        () => false,
        dbDeleteAllConversations,
      ),
    [sweep],
  );

  const deleteUnbookmarkedConversations = useCallback(() => {
    // The live conversation goes only when it's unbookmarked, and a brand-new
    // chat is implicitly unbookmarked so it's swept too. A bookmarked one
    // survives, so its save must still land — hence the conditional mark but
    // the unconditional drain.
    const sweepsLive = (): boolean =>
      store.activeId() == null || !store.metaRef.current?.bookmarked;

    // Bookmarked records survive this sweep, so their undos stay offerable.
    return sweep(
      sweepsLive,
      (record) => record.bookmarked,
      dbDeleteUnbookmarkedConversations,
    );
  }, [sweep, store]);

  return { deleteAllConversations, deleteUnbookmarkedConversations };
}
