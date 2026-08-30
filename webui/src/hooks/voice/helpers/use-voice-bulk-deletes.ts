// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type UndoDeleteReturn } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import { type ConversationStore } from "#webui/lib/conversation-store";
import {
  type ConversationRecord,
  deleteAllConversations as dbDeleteAllConversations,
  deleteUnbookmarkedConversations as dbDeleteUnbookmarkedConversations,
} from "#webui/lib/conversation-db";

/** The voice-persistence state the bulk deletes read and write. */
export interface VoiceBulkDeleteParams {
  store: ConversationStore;
  refreshList: () => Promise<void>;
  /** Leaves the live conversation for a fresh, unsaved one. */
  startNewConversation: () => void;
  /** Told when the wipe takes the live record, so the session can be stopped. */
  onLiveRecordDeleted?: () => void;
  undoDelete: UndoDeleteReturn;
}

export interface VoiceBulkDeletes {
  deleteAllConversations: () => Promise<void>;
  deleteUnbookmarkedConversations: () => Promise<void>;
}

/**
 * The delete-everything and delete-unbookmarked sweeps for voice mode, mirroring
 * chat's useBulkDeletes: take the live conversation out of play, drain the
 * queued saves, sweep, then start a fresh session.
 * @param params - The store and callbacks these sweeps operate on
 * @returns The two bulk-delete handlers
 */
export function useVoiceBulkDeletes(
  params: VoiceBulkDeleteParams,
): VoiceBulkDeletes {
  const {
    store,
    refreshList,
    startNewConversation,
    onLiveRecordDeleted,
    undoDelete,
  } = params;

  /**
   * Wipe conversations, taking the live one with them unless it is spared.
   * @param removeRows - Clears the matching rows from the DB
   * @param sparesLive - Whether the live conversation survives this wipe. Asked
   * again after the wipe, because the user can switch conversations while it
   * runs and the answer belongs to whichever one is live at the end.
   * @param survivesSweep - Whether a record outlives this wipe. The undo banner
   * never auto-expires, so a pending undo for a record the wipe would have
   * taken anyway is dropped rather than left offering to put it back.
   */
  const sweep = useCallback(
    async (
      removeRows: () => Promise<void>,
      sparesLive: () => boolean,
      survivesSweep: (record: ConversationRecord) => boolean,
    ) => {
      let undoMark: (() => void) | null = null;

      if (!sparesLive()) {
        // Fire only for a conversation that reached the DB — a session with
        // nothing saved yet has no record to lose. Ask before marking: a marked
        // slot reports no active id.
        if (store.activeId() != null) onLiveRecordDeleted?.();
        // A bulk delete doesn't stop the live session, so without this the next
        // autosave would write the wiped conversation straight back.
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
      undoDelete.dropUndoable((record) => !survivesSweep(record));

      if (!sparesLive()) startNewConversation();
      await refreshList();
    },
    [store, refreshList, startNewConversation, onLiveRecordDeleted, undoDelete],
  );

  const deleteAllConversations = useCallback(
    () =>
      sweep(
        dbDeleteAllConversations,
        () => false,
        () => false,
      ),
    [sweep],
  );

  const deleteUnbookmarkedConversations = useCallback(
    () =>
      sweep(
        dbDeleteUnbookmarkedConversations,
        () => store.metaRef.current?.bookmarked ?? false,
        (record) => record.bookmarked,
      ),
    [sweep, store],
  );

  return { deleteAllConversations, deleteUnbookmarkedConversations };
}
