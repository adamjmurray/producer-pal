// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type UndoDeleteReturn } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import {
  type SweepScope,
  runBulkDeleteSweep,
} from "#webui/lib/conversations/bulk-delete-sweep";
import { type ConversationStore } from "#webui/lib/conversations/conversation-store";

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
 * Voice's delete-everything and delete-unbookmarked sweeps. The sweep is shared
 * with chat; what voice adds is stopping the live session when the wipe takes
 * the record it is recording into.
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

  const sweep = useCallback(
    (scope: SweepScope) =>
      runBulkDeleteSweep(scope, {
        store,
        refreshList,
        dropUndoable: undoDelete.dropUndoable,
        onLiveRowGone: () => {
          // Fire only for a conversation that reached the DB — a session with
          // nothing saved yet has no record to lose.
          if (store.metaRef.current != null) {
            onLiveRecordDeleted?.();
          }

          startNewConversation();
        },
      }),
    [store, refreshList, startNewConversation, onLiveRecordDeleted, undoDelete],
  );

  const deleteAllConversations = useCallback(() => sweep("all"), [sweep]);
  const deleteUnbookmarkedConversations = useCallback(
    () => sweep("unbookmarked"),
    [sweep],
  );

  return { deleteAllConversations, deleteUnbookmarkedConversations };
}
