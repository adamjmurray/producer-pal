// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import { formatSaveErrorMessage } from "#webui/hooks/chat/helpers/notifications/use-limit-notification";
import {
  type ConversationRecord,
  deleteConversation,
  loadConversation,
  saveConversation,
} from "#webui/lib/conversation-db";
import {
  formatTimestampDate,
  formatTimestampTime,
} from "#webui/lib/utils/format-timestamp";

/** Cap on how many just-deleted conversations are held for undo. */
const MAX_UNDO_HISTORY = 10;
/** Longest title shown in the undo banner before truncation. */
const MAX_TITLE_LENGTH = 40;

export interface UndoDeleteReturn {
  /** Undo banner for the most recently deleted conversation, or null. */
  undoNotification: TransferNotificationData | null;
  /** Delete a conversation, snapshotting it first so undo can put it back. */
  deleteWithUndo: (id: string) => Promise<void>;
  /** Snapshot a just-deleted record so it can be restored, and show the banner. */
  pushDeleted: (record: ConversationRecord) => void;
  /** Drop all pending undos and hide the banner. */
  dismissUndoNotification: () => void;
  /** Drop the pending undos a bulk delete has just made invalid. */
  dropUndoable: (shouldDrop: (record: ConversationRecord) => boolean) => void;
  /** Point the undo at the mounted mode's list refresher, so a restore updates
   *  the sidebar of whichever mode the user is in when they click Undo. */
  setRefreshList: (refresh: () => Promise<void>) => void;
}

/**
 * Tracks recently deleted conversations so they can be restored (undone).
 * Deletes stack LIFO: the banner always reflects the latest deletion, and each
 * undo restores that record then reveals the previous one (multi-level undo with
 * a history depth greater than one). Records live only in memory until undone or
 * dismissed — the DB row is already gone by the time {@link pushDeleted} runs, so
 * a restore that fails to save keeps the record on the stack and turns the banner
 * into a retryable error rather than losing the conversation.
 *
 * Owned by App and shared by both modes, so a delete stays undoable across a
 * chat/voice switch — the sidebar is one list, and the delete control on a row
 * has to mean the same thing whichever mode is showing it. Whichever mode is
 * mounted registers its list refresher via {@link UndoDeleteReturn.setRefreshList}.
 * @returns Undo banner state and handlers
 */
export function useUndoDelete(): UndoDeleteReturn {
  // The mounted mode owns the conversation list, and which mode that is can
  // change between the delete and the undo.
  const refreshListRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const setRefreshList = useCallback((refresh: () => Promise<void>) => {
    refreshListRef.current = refresh;
  }, []);
  // stackRef is the source of truth (read synchronously by undo); `stack` state
  // mirrors it only to re-render the banner. Records are small metadata +
  // transcript, capped at MAX_UNDO_HISTORY, so holding them in memory is cheap.
  const stackRef = useRef<ConversationRecord[]>([]);
  const [stack, setStack] = useState<ConversationRecord[]>([]);
  // Set when a restore save rejects: the record stays on the stack (so the user
  // can retry) and the banner turns into an error until the next successful undo.
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // Guards against a double-click firing two concurrent restores of the same
  // record (redundant saves + refreshes); released once the restore settles.
  const undoInFlightRef = useRef(false);

  const sync = useCallback((next: ConversationRecord[]) => {
    stackRef.current = next;
    setStack(next);
  }, []);

  const undo = useCallback(async () => {
    if (undoInFlightRef.current) return;

    const restored = stackRef.current.at(-1);

    if (!restored) return;

    undoInFlightRef.current = true;

    // Run the restore, releasing the guard once it settles. The release lives in
    // a .finally() callback (its own scope), not an `await … finally` in this
    // async body, which would trip require-atomic-updates on the ref write.
    //
    // Save BEFORE popping. The DB row was already deleted at delete-time, so the
    // record survives only on this stack; popping before the save would lose it
    // permanently if the save rejects (e.g. QuotaExceededError). Pop only on
    // success, and remove by identity in case a delete raced in during the await.
    await (async () => {
      try {
        await saveConversation(restored);
      } catch (error) {
        setRestoreError(formatSaveErrorMessage(error));

        return;
      }

      setRestoreError(null);
      sync(stackRef.current.filter((record) => record !== restored));
      await refreshListRef.current();
    })().finally(() => {
      undoInFlightRef.current = false;
    });
  }, [sync]);

  const pushDeleted = useCallback(
    (record: ConversationRecord) => {
      setRestoreError(null);
      sync([...stackRef.current, record].slice(-MAX_UNDO_HISTORY));
    },
    [sync],
  );

  // Load before deleting: the row is the only copy of the transcript, so the
  // snapshot has to be taken while it still exists. Pushed only once the delete
  // resolves, so a failed delete doesn't offer to restore a record still there.
  const deleteWithUndo = useCallback(
    async (id: string) => {
      const record = await loadConversation(id);

      await deleteConversation(id);

      if (record) pushDeleted(record);
    },
    [pushDeleted],
  );

  const dismiss = useCallback(() => {
    setRestoreError(null);
    sync([]);
  }, [sync]);

  // A bulk delete would have removed these records anyway, so offering to
  // restore them turns the banner into a way to un-delete part of a wipe. Drop
  // them instead. Predicate rather than a blanket clear: "delete unbookmarked"
  // leaves bookmarked records alone, so an undo for one of those is still good.
  const dropUndoable = useCallback(
    (shouldDrop: (record: ConversationRecord) => boolean) => {
      setRestoreError(null);
      sync(stackRef.current.filter((record) => !shouldDrop(record)));
    },
    [sync],
  );

  const top = stack.at(-1);
  const undoNotification: TransferNotificationData | null = top
    ? {
        message: restoreError ?? `Deleted “${undoTitle(top)}”`,
        type: restoreError ? "error" : "warning",
        action: {
          label: restoreError ? "Retry" : "Undo",
          onClick: () => void undo(),
        },
      }
    : null;

  return {
    undoNotification,
    deleteWithUndo,
    pushDeleted,
    dismissUndoNotification: dismiss,
    dropUndoable,
    setRefreshList,
  };
}

// --- Helpers below main export ---

/**
 * Build a short, truncated label for a deleted conversation. Falls back to a
 * timestamp (matching the conversation list) when the record has no title.
 * @param record - The deleted conversation record
 * @returns Display label capped at {@link MAX_TITLE_LENGTH}
 */
function undoTitle(record: ConversationRecord): string {
  const label =
    record.title ??
    `${formatTimestampDate(record.updatedAt)}, ${formatTimestampTime(record.updatedAt)}`;

  return label.length > MAX_TITLE_LENGTH
    ? `${label.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : label;
}
