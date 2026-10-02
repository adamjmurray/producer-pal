// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ConversationRecord,
  deleteAllConversations,
  deleteUnbookmarkedConversations,
  loadConversation,
} from "#webui/lib/conversation-db";
import { type ConversationStore } from "#webui/lib/conversations/conversation-store";

/** Which stored conversations a sweep takes. */
export type SweepScope = "all" | "unbookmarked";

/** What a sweep needs from the mode (chat or voice) running it. */
export interface BulkDeleteSweepParams {
  store: ConversationStore;
  refreshList: () => Promise<void>;
  /** Drops the pending undos this sweep has just invalidated. */
  dropUndoable: (shouldDrop: (record: ConversationRecord) => boolean) => void;
  /** Run before the live conversation is marked deleted, when this sweep takes
   * it. Chat drops its pending fork here; voice has nothing to drop. */
  beforeMark?: () => void;
  /** Run once the live conversation's row is confirmed gone: tear the view down
   * and leave for a fresh conversation. */
  onLiveRowGone: () => void;
}

/**
 * Run one bulk delete — everything, or everything unbookmarked.
 *
 * Take the live conversation out of play, drain the queued saves, remove the
 * rows, then tear the view down if the live row went with them. The mark is
 * what stops an autosave writing a wiped conversation straight back: a bulk
 * delete doesn't stop the session, and chat's stream-teardown autosave fires
 * from a passive effect after the drain has captured the queue. A brand-new
 * conversation is covered by the same mark, because the store mints its id when
 * the conversation begins rather than inside the save.
 *
 * Shared by chat and voice, which differ only in the two hooks above. They each
 * had their own copy of this and the scope predicate drifted apart.
 * @param scope - Which conversations to remove
 * @param params - The store and callbacks this sweep operates on
 * @returns Resolves once the rows are gone and the list is refreshed
 */
export async function runBulkDeleteSweep(
  scope: SweepScope,
  params: BulkDeleteSweepParams,
): Promise<void> {
  const { store, refreshList, dropUndoable, beforeMark, onLiveRowGone } =
    params;
  let undoMark: (() => void) | null = null;

  if (sweepTakesLive(scope, store)) {
    beforeMark?.();
    undoMark = store.markDeleted();
  }

  await store.drain();

  try {
    await removeRows(scope);
  } catch (error) {
    // The rows survived, so the conversation is live again — leaving it marked
    // deleted would make a listed conversation unsaveable.
    undoMark?.();
    throw error;
  }

  // Dropped only once the rows are really gone. An undo record is the only copy
  // left of a conversation the user deleted, and dropping it is irreversible,
  // so a sweep that threw must not take it down with it.
  dropUndoable((record) => !survivesSweep(scope, record));

  // Ground truth for whichever conversation is live now, not a re-derived
  // predicate — see sweepTakesLive for why.
  const liveId = store.liveId();
  let liveRowSurvived: boolean;

  try {
    liveRowSurvived = (await loadConversation(liveId)) != null;
  } catch (error) {
    // Rows are already gone or kept — this only failed to confirm which.
    // Leaving a live conversation alone on an unproven guess is safer than
    // tearing it down on one, so treat the failure as "survived". The cost:
    // undoMark restores a slot markDeleted() tore down, so the next autosave
    // can write the just-deleted row right back.
    console.error(
      "Failed to confirm live conversation survived the sweep",
      error,
    );
    liveRowSurvived = true;
  }

  if (liveRowSurvived) {
    undoMark?.();
  } else {
    onLiveRowGone();
  }

  await refreshList();
}

// --- Helpers below main export ---

/**
 * Whether the live conversation is in scope for this sweep, asked once before
 * the wipe to decide the protective mark. What actually happens to it is read
 * back from the DB afterward rather than asked again: a bookmark toggled while
 * the mark is up can't reach metaRef, so a re-derived answer would get it wrong.
 *
 * A conversation with no published id has no bookmark to spare it — a brand-new
 * chat is implicitly unbookmarked, so an unbookmarked sweep takes it too.
 * @param scope - Which conversations this sweep removes
 * @param store - The store holding the live conversation
 * @returns True when this sweep would take the live conversation
 */
function sweepTakesLive(scope: SweepScope, store: ConversationStore): boolean {
  return (
    scope === "all" ||
    store.activeId() == null ||
    !store.metaRef.current?.bookmarked
  );
}

/**
 * Whether a record outlives this sweep. The undo banner never auto-expires, so
 * a pending undo for a record the sweep would have taken anyway is dropped
 * rather than left offering to put it back.
 * @param scope - Which conversations this sweep removes
 * @param record - The record a pending undo would restore
 * @returns True when the sweep leaves that record alone
 */
function survivesSweep(scope: SweepScope, record: ConversationRecord): boolean {
  return scope === "unbookmarked" && record.bookmarked;
}

/**
 * Clear this sweep's rows from the DB.
 * @param scope - Which conversations to remove
 * @returns Resolves once they are gone
 */
function removeRows(scope: SweepScope): Promise<void> {
  return scope === "all"
    ? deleteAllConversations()
    : deleteUnbookmarkedConversations();
}
