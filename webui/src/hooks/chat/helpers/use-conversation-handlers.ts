// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type UseConversationsReturn } from "#webui/hooks/chat/use-conversations";

/**
 * Creates stable callback wrappers for conversation manager methods.
 * @param manager - Conversation manager from useConversations
 * @param stopResponse - Stops the current AI response stream
 * @returns Stable callback handlers for conversation operations
 */
export function useConversationHandlers(
  manager: UseConversationsReturn,
  stopResponse: () => void,
) {
  const handleNew = useCallback(() => {
    stopResponse();
    manager.startNewConversation();
  }, [manager, stopResponse]);
  const handleSelect = useCallback(
    (id: string) => {
      stopResponse();
      manager.switchConversation(id).catch(console.error);
    },
    [manager, stopResponse],
  );
  const handleDelete = useCallback(
    (id: string) => {
      manager.deleteConversation(id).catch(console.error);
    },
    [manager],
  );
  const handleRename = useCallback(
    (id: string, title: string | null) => {
      manager.renameConversation(id, title).catch(console.error);
    },
    [manager],
  );
  const handleToggleBookmark = useCallback(
    (id: string) => {
      manager.toggleBookmark(id).catch(console.error);
    },
    [manager],
  );
  const handleDeleteAll = useCallback(() => {
    stopResponse();
    manager.deleteAllConversations().catch(console.error);
  }, [manager, stopResponse]);
  const handleDeleteUnbookmarked = useCallback(() => {
    stopResponse();
    manager.deleteUnbookmarkedConversations().catch(console.error);
  }, [manager, stopResponse]);

  return {
    handleNew,
    handleSelect,
    handleDelete,
    handleRename,
    handleToggleBookmark,
    handleDeleteAll,
    handleDeleteUnbookmarked,
  };
}
