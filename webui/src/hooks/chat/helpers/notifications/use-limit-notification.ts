// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import {
  type EnforceLimitResult,
  MAX_CONVERSATIONS,
} from "#webui/lib/conversation-db";

const AUTO_DISMISS_MS = 4000;

/**
 * Hook managing the notification banner for conversation persistence events
 * (limit enforcement and save failures).
 * @returns Notification state, dismiss handler, and functions to show
 *   limit-enforcement results, save errors, and refused saves
 */
export function useLimitNotification(): {
  limitNotification: TransferNotificationData | null;
  dismissLimitNotification: () => void;
  showLimitNotification: (result: EnforceLimitResult) => void;
  showSaveError: (error: unknown) => void;
  showSaveRefused: () => void;
} {
  const [notification, setNotification] =
    useState<TransferNotificationData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotification(null);
  }, []);

  const showTimed = useCallback((data: TransferNotificationData) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotification(data);
    timerRef.current = setTimeout(() => setNotification(null), AUTO_DISMISS_MS);
  }, []);

  const show = useCallback(
    (result: EnforceLimitResult) => {
      if (result.deletedCount === 0 && !result.limitReached) return;

      const message = result.limitReached
        ? `Conversation limit (${MAX_CONVERSATIONS}) reached — unbookmark or delete conversations to free space`
        : `Removed ${result.deletedCount} old conversation${result.deletedCount === 1 ? "" : "s"} (${MAX_CONVERSATIONS} limit)`;

      showTimed({ message, type: "warning" });
    },
    [showTimed],
  );

  const showError = useCallback(
    (error: unknown) => {
      showTimed({ message: formatSaveErrorMessage(error), type: "error" });
    },
    [showTimed],
  );

  // The write was refused, not failed: the row this conversation belongs to is
  // gone, and writing it back would resurrect something a delete took away.
  // Nothing more will be saved to it, so say so rather than going quiet.
  const showRefused = useCallback(() => {
    showTimed({
      message:
        "This conversation is no longer in storage — it was deleted, so nothing more will be saved to it.",
      type: "error",
    });
  }, [showTimed]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    limitNotification: notification,
    dismissLimitNotification: dismiss,
    showLimitNotification: show,
    showSaveError: showError,
    showSaveRefused: showRefused,
  };
}

/**
 * Build a user-facing message for an IndexedDB save failure, with a
 * targeted hint when the browser's storage quota is exhausted. Shared with the
 * undo-delete banner, which re-saves a restored record.
 * @param error - The thrown error
 * @returns Display message
 */
export function formatSaveErrorMessage(error: unknown): string {
  const isQuota =
    (error instanceof DOMException && error.name === "QuotaExceededError") ||
    (error instanceof Error && /quota/i.test(error.message));

  if (isQuota) {
    return "Couldn't save conversation: browser storage is full. Delete or export old conversations to free space.";
  }

  const detail = error instanceof Error ? error.message : String(error);

  return `Couldn't save conversation: ${detail}`;
}
