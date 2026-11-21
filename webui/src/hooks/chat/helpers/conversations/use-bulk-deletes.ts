// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback } from "preact/hooks";
import { isLeavingLive } from "#webui/hooks/chat/helpers/conversations/is-leaving-live";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import {
  type SweepScope,
  runBulkDeleteSweep,
} from "#webui/lib/conversations/bulk-delete-sweep";
import { type ConversationStore } from "#webui/lib/conversations/conversation-store";

/** The useConversations state the bulk deletes read and write. */
export interface BulkDeleteParams {
  store: ConversationStore;
  /** Tears the chat view down and leaves for a fresh conversation. `leaving`
   * is whether there was a conversation to leave, as read before the sweep. */
  onLiveRowGone: (leaving: boolean) => void;
  /** Returns the live chat's messages, to tell an empty new chat from one in use. */
  getChatHistory: () => unknown[];
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
 * Chat's delete-everything and delete-unbookmarked sweeps. The sweep is shared
 * with voice; what chat adds is dropping a pending fork and tearing the chat
 * view down.
 * @param params - The store and callbacks these sweeps operate on
 * @returns The two bulk-delete handlers
 */
export function useBulkDeletes(params: BulkDeleteParams): BulkDeletes {
  const {
    store,
    onLiveRowGone,
    getChatHistory,
    refreshList,
    dropPendingFork,
    dropUndoable,
  } = params;

  const sweep = useCallback(
    (scope: SweepScope) => {
      const leaving = isLeavingLive(store, getChatHistory);

      return runBulkDeleteSweep(scope, {
        store,
        refreshList,
        dropUndoable,
        beforeMark: dropPendingFork,
        onLiveRowGone: () => onLiveRowGone(leaving),
      });
    },
    [
      store,
      onLiveRowGone,
      getChatHistory,
      refreshList,
      dropPendingFork,
      dropUndoable,
    ],
  );

  const deleteAllConversations = useCallback(() => sweep("all"), [sweep]);
  const deleteUnbookmarkedConversations = useCallback(
    () => sweep("unbookmarked"),
    [sweep],
  );

  return { deleteAllConversations, deleteUnbookmarkedConversations };
}
