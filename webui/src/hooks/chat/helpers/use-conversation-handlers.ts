// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type UseConversationsReturn } from "#webui/hooks/chat/use-conversations";

/**
 * Creates stable callback wrappers for conversation manager methods.
 * @param manager - Conversation manager from useConversations
 * @returns Stable callback handlers for conversation operations
 */
export function useConversationHandlers(manager: UseConversationsReturn) {
  const handleNew = useCallback(() => {
    manager.startNewConversation();
  }, [manager]);
  const handleSelect = useCallback(
    (id: string) => {
      manager.switchConversation(id).catch(console.error);
    },
    [manager],
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

  return {
    handleNew,
    handleSelect,
    handleDelete,
    handleRename,
    handleToggleBookmark,
  };
}
