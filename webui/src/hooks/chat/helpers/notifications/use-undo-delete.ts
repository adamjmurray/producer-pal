// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import { formatSaveErrorMessage } from "#webui/hooks/chat/helpers/notifications/use-limit-notification";
import {
  type ConversationRecord,
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
  /** Snapshot a just-deleted record so it can be restored, and show the banner. */
  pushDeleted: (record: ConversationRecord) => void;
  /** Drop all pending undos and hide the banner. */
  dismissUndoNotification: () => void;
  /** Drop the pending undos a bulk delete has just made invalid. */
  dropUndoable: (shouldDrop: (record: ConversationRecord) => boolean) => void;
}

/**
 * Tracks recently deleted conversations so they can be restored (undone).
 * Deletes stack LIFO: the banner always reflects the latest deletion, and each
 * undo restores that record then reveals the previous one (multi-level undo with
 * a history depth greater than one). Records live only in memory until undone or
 * dismissed — the DB row is already gone by the time {@link pushDeleted} runs, so
 * a restore that fails to save keeps the record on the stack and turns the banner
 * into a retryable error rather than losing the conversation.
 * @param refreshList - Refreshes the conversation list after a restore
 * @param onRestore - Optional callback invoked with the restored id after a
 *   successful undo save. The conversation manager uses it to un-cancel the id
 *   in its delete guard so post-undo autosaves aren't silently dropped.
 * @returns Undo banner state and handlers
 */
export function useUndoDelete(
  refreshList: () => Promise<void>,
  onRestore?: (id: string) => void,
): UndoDeleteReturn {
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

      // Un-cancel the restored id before anything else in the success path: the
      // row is back under its original id, so the manager's add-only delete
      // guard must stop dropping its autosaves. Skipped on the failure path
      // above — a row that didn't come back stays canceled, correctly.
      onRestore?.(restored.id);
      setRestoreError(null);
      sync(stackRef.current.filter((record) => record !== restored));
      await refreshList();
    })().finally(() => {
      undoInFlightRef.current = false;
    });
  }, [refreshList, sync, onRestore]);

  const pushDeleted = useCallback(
    (record: ConversationRecord) => {
      setRestoreError(null);
      sync([...stackRef.current, record].slice(-MAX_UNDO_HISTORY));
    },
    [sync],
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
    pushDeleted,
    dismissUndoNotification: dismiss,
    dropUndoable,
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
