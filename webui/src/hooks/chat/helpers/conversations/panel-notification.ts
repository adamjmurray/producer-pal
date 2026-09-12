// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";

/**
 * Pick which banner the conversation panel shows and the matching dismiss
 * handler.
 * @param undo - Undo-delete notification state and dismiss handler
 * @param limit - Limit/save-error notification state and dismiss handler
 * @returns The active notification and the handler that dismisses it
 */
export function resolvePanelNotification(
  undo: {
    undoNotification: TransferNotificationData | null;
    dismissUndoNotification: () => void;
  },
  limit: {
    limitNotification: TransferNotificationData | null;
    dismissLimitNotification: () => void;
  },
): {
  notification: TransferNotificationData | null;
  dismissNotification: () => void;
} {
  const undoNote = undo.undoNotification;
  const limitNote = limit.limitNotification;
  // Severity first — an error (a save failure, i.e. data loss) outranks a
  // warning — then the fresher undo banner wins within one severity. Severity
  // has to come first because the undo banner never auto-expires, so otherwise
  // a stale "Deleted …" banner would indefinitely mask a later save error.
  const limitWins =
    limitNote != null &&
    (undoNote == null ||
      (limitNote.type === "error" && undoNote.type !== "error"));

  if (limitWins) {
    return {
      notification: limitNote,
      dismissNotification: limit.dismissLimitNotification,
    };
  }

  return {
    notification: undoNote ?? limitNote,
    dismissNotification: undoNote
      ? undo.dismissUndoNotification
      : limit.dismissLimitNotification,
  };
}
