// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import {
  exportConversation,
  exportConversations,
  importConversations,
} from "#webui/lib/conversation-transfer";

/**
 * Format an error for user-facing notification.
 * @param label - Operation label (e.g. "Export", "Import")
 * @param err - Caught error value
 * @returns Formatted error message
 */
function formatError(label: string, err: unknown): string {
  return `${label} failed: ${err instanceof Error ? err.message : "unknown error"}`;
}

/**
 * Hook managing conversation export/import with notification feedback.
 * @param refreshList - Callback to refresh the conversation list after import
 * @returns Transfer handlers and notification state
 */
export function useConversationTransfer(refreshList: () => Promise<void>): {
  notification: TransferNotificationData | null;
  dismissNotification: () => void;
  handleExport: () => Promise<void>;
  handleExportOne: (id: string) => Promise<void>;
  handleImport: () => Promise<void>;
} {
  const [notification, setNotification] =
    useState<TransferNotificationData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback(
    (message: string, type: "success" | "error") => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setNotification({ message, type });
      timerRef.current = setTimeout(() => setNotification(null), 4000);
    },
    [],
  );

  const dismissNotification = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotification(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const { json, count } = await exportConversations();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `producer-pal-conversations-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showNotification(
        `Exported ${count} conversation${count === 1 ? "" : "s"}`,
        "success",
      );
    } catch (err) {
      showNotification(formatError("Export", err), "error");
    }
  }, [showNotification]);

  const handleExportOne = useCallback(
    async (id: string) => {
      try {
        const { json, title } = await exportConversation(id);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const date = new Date().toISOString().slice(0, 10);
        const slug = title
          ? `-${title
              .toLowerCase()
              .replaceAll(/[^\da-z]+/g, "-")
              .replaceAll(/(^-|-$)/g, "")}`
          : "";

        a.href = url;
        a.download = `producer-pal-conversation${slug}-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification("Exported conversation", "success");
      } catch (err) {
        showNotification(formatError("Export", err), "error");
      }
    },
    [showNotification],
  );

  const handleImport = useCallback(async () => {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".json";

    const onFileSelected = async (file: File) => {
      try {
        const text = await file.text();
        const { newCount, updatedCount, skippedCount } =
          await importConversations(text);

        await refreshList();

        const parts: string[] = [];

        if (newCount > 0) parts.push(`${newCount} new`);
        if (updatedCount > 0) parts.push(`${updatedCount} updated`);
        if (skippedCount > 0) parts.push(`${skippedCount} skipped`);

        const total = newCount + updatedCount;
        const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";

        showNotification(
          `Imported ${total} conversation${total === 1 ? "" : "s"}${detail}`,
          "success",
        );
      } catch (err) {
        showNotification(formatError("Import", err), "error");
      }
    };

    input.onchange = () => {
      const file = input.files?.[0];

      if (file) void onFileSelected(file);
    };

    input.click();
  }, [refreshList, showNotification]);

  return {
    notification,
    dismissNotification,
    handleExport,
    handleExportOne,
    handleImport,
  };
}
