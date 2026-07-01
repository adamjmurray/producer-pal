// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
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
}

/**
 * Tracks recently deleted conversations so they can be restored (undone).
 * Deletes stack LIFO: the banner always reflects the latest deletion, and each
 * undo restores that record then reveals the previous one (multi-level undo with
 * a history depth greater than one). Records live only in memory until undone or
 * dismissed — the DB row is already gone by the time {@link pushDeleted} runs.
 * @param refreshList - Refreshes the conversation list after a restore
 * @returns Undo banner state and handlers
 */
export function useUndoDelete(
  refreshList: () => Promise<void>,
): UndoDeleteReturn {
  // stackRef is the source of truth (read synchronously by undo); `stack` state
  // mirrors it only to re-render the banner. Records are small metadata +
  // transcript, capped at MAX_UNDO_HISTORY, so holding them in memory is cheap.
  const stackRef = useRef<ConversationRecord[]>([]);
  const [stack, setStack] = useState<ConversationRecord[]>([]);

  const sync = useCallback((next: ConversationRecord[]) => {
    stackRef.current = next;
    setStack(next);
  }, []);

  const undo = useCallback(async () => {
    const restored = stackRef.current.at(-1);

    if (!restored) return;

    sync(stackRef.current.slice(0, -1));
    await saveConversation(restored);
    await refreshList();
  }, [refreshList, sync]);

  const pushDeleted = useCallback(
    (record: ConversationRecord) => {
      sync([...stackRef.current, record].slice(-MAX_UNDO_HISTORY));
    },
    [sync],
  );

  const dismiss = useCallback(() => sync([]), [sync]);

  const top = stack.at(-1);
  const undoNotification: TransferNotificationData | null = top
    ? {
        message: `Deleted “${undoTitle(top)}”`,
        type: "warning",
        action: { label: "Undo", onClick: () => void undo() },
      }
    : null;

  return {
    undoNotification,
    pushDeleted,
    dismissUndoNotification: dismiss,
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
