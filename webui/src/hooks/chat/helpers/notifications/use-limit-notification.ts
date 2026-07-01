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
 *   limit-enforcement results or save errors
 */
export function useLimitNotification(): {
  limitNotification: TransferNotificationData | null;
  dismissLimitNotification: () => void;
  showLimitNotification: (result: EnforceLimitResult) => void;
  showSaveError: (error: unknown) => void;
} {
  const [notification, setNotification] =
    useState<TransferNotificationData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotification(null);
  }, []);

  const show = useCallback((result: EnforceLimitResult) => {
    if (result.deletedCount === 0 && !result.limitReached) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const message = result.limitReached
      ? `Conversation limit (${MAX_CONVERSATIONS}) reached — unbookmark or delete conversations to free space`
      : `Removed ${result.deletedCount} old conversation${result.deletedCount === 1 ? "" : "s"} (${MAX_CONVERSATIONS} limit)`;

    setNotification({ message, type: "warning" });
    timerRef.current = setTimeout(() => setNotification(null), AUTO_DISMISS_MS);
  }, []);

  const showError = useCallback((error: unknown) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotification({ message: formatSaveErrorMessage(error), type: "error" });
    timerRef.current = setTimeout(() => setNotification(null), AUTO_DISMISS_MS);
  }, []);

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
  };
}

/**
 * Build a user-facing message for an IndexedDB save failure, with a
 * targeted hint when the browser's storage quota is exhausted.
 * @param error - The thrown error
 * @returns Display message
 */
function formatSaveErrorMessage(error: unknown): string {
  const isQuota =
    (error instanceof DOMException && error.name === "QuotaExceededError") ||
    (error instanceof Error && /quota/i.test(error.message));

  if (isQuota) {
    return "Couldn't save conversation: browser storage is full. Delete or export old conversations to free space.";
  }

  const detail = error instanceof Error ? error.message : String(error);

  return `Couldn't save conversation: ${detail}`;
}
