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
  loadConversation,
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
   * @param sparesLive - Whether the live conversation survives this wipe,
   * asked once before the wipe to decide the protective mark below. What
   * actually happened to the live conversation is read back from the DB
   * afterward rather than asked again: metaRef can't be trusted to reflect a
   * change (e.g. a bookmark toggle) that landed while this slot was marked
   * deleted — patchActiveMeta refuses to write to a marked slot.
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
      // A bulk delete doesn't stop the live session, so without this the next
      // autosave would write the wiped conversation straight back.
      const undoMark = sparesLive() ? null : store.markDeleted();

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

      // Ground truth for whichever conversation is live now, not a re-derived
      // predicate: a conversation with no row (never saved, or genuinely
      // swept) is treated the same either way, and one whose row survived —
      // switched to mid-sweep, or spared by a change metaRef missed — is left
      // alone.
      const liveId = store.liveId();
      let liveRowSurvived: boolean;

      try {
        liveRowSurvived = (await loadConversation(liveId)) != null;
      } catch (error) {
        // Rows are already gone or kept — this only failed to confirm which.
        // That's not evidence the live record was swept, so assume it
        // wasn't: leaving a live call alone on an unproven guess is safer
        // than killing it on one, and the latter is the exact failure mode
        // this sweep exists to avoid. The caller is fire-and-forget, so
        // surface the failure here rather than letting it become an
        // unhandled rejection.
        console.error(
          "Failed to confirm live conversation survived the sweep",
          error,
        );
        liveRowSurvived = true;
      }

      if (liveRowSurvived) {
        // The mark said this conversation was going, but it wasn't — restore
        // the slot so the sidebar and hash still show it.
        undoMark?.();
      } else {
        // Fire only for a conversation that reached the DB — a session with
        // nothing saved yet has no record to lose.
        if (store.metaRef.current != null) onLiveRecordDeleted?.();
        startNewConversation();
      }

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
