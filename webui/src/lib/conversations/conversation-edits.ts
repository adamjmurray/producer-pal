// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ConversationSummary,
  renameConversation,
  setBookmark,
} from "#webui/lib/conversation-db";
import { type ConversationStore } from "#webui/lib/conversations/conversation-store";

/** What deleting one conversation needs from the mode running it. */
export interface DeleteConversationParams {
  store: ConversationStore;
  /** The conversation to delete. */
  id: string;
  /** Removes the row, keeping a snapshot the undo banner can restore. */
  deleteWithUndo: (id: string) => Promise<void>;
  refreshList: () => Promise<void>;
  /** Run before the live conversation is marked deleted. Chat drops its pending
   * fork here; voice has nothing to drop. */
  beforeMark?: () => void;
  /** Run when the conversation deleted was still the live one: tear the view
   * down and leave for a fresh conversation. */
  onLiveGone: () => void;
}

/**
 * Delete one conversation, live or merely listed.
 *
 * The mark takes the live conversation out of play before any await: chat's
 * handleDelete stops the stream first, and that fires one more autosave from a
 * passive effect after the drain has captured the queue. Marked deleted, that
 * save never starts.
 * @param params - The store, the id, and the callbacks this delete operates on
 * @returns Resolves once the row is gone and the list is refreshed
 */
export async function deleteOneConversation(
  params: DeleteConversationParams,
): Promise<void> {
  const { store, id, deleteWithUndo, refreshList, beforeMark, onLiveGone } =
    params;
  let undoMark: (() => void) | null = null;

  if (id === store.activeId()) {
    beforeMark?.();
    undoMark = store.markDeleted();
  }

  // Drain the saves already queued before removing the row, so one can't land
  // afterward. drain() never rejects, so awaiting it outside the try below
  // can't strand the mark.
  await store.drain();

  try {
    await deleteWithUndo(id);
  } catch (error) {
    // The row survived, so the conversation is live again — leaving it marked
    // deleted would make a listed conversation unsaveable.
    undoMark?.();
    throw error;
  }

  // Ask again rather than trusting the answer from before the awaits: the user
  // can switch conversations while the delete runs, and tearing the view down
  // then would throw away the one they just opened. liveId, not activeId — a
  // marked slot reports no active id, so the untouched case has to be
  // recognized by id.
  if (store.liveId() === id) {
    onLiveGone();
  }

  await refreshList();
}

/**
 * Retitle a stored conversation, keeping the live one's metadata in step.
 * @param store - The store holding the live conversation
 * @param refreshList - Re-reads the sidebar list
 * @param id - The conversation to retitle
 * @param title - The new title, or null to clear it
 * @returns Resolves once the list is refreshed
 */
export async function renameStoredConversation(
  store: ConversationStore,
  refreshList: () => Promise<void>,
  id: string,
  title: string | null,
): Promise<void> {
  await renameConversation(id, title);
  store.patchActiveMeta(id, { title });

  await refreshList();
}

/**
 * Flip a listed conversation's bookmark, keeping the live one's metadata in
 * step. A no-op for an id the list doesn't hold.
 * @param store - The store holding the live conversation
 * @param refreshList - Re-reads the sidebar list
 * @param conversations - The sidebar list, which holds the current value
 * @param id - The conversation to toggle
 * @returns Resolves once the list is refreshed
 */
export async function toggleStoredBookmark(
  store: ConversationStore,
  refreshList: () => Promise<void>,
  conversations: ConversationSummary[],
  id: string,
): Promise<void> {
  const conversation = conversations.find((c) => c.id === id);

  if (!conversation) {
    return;
  }

  const bookmarked = !conversation.bookmarked;

  await setBookmark(id, bookmarked);
  store.patchActiveMeta(id, { bookmarked });

  await refreshList();
}
