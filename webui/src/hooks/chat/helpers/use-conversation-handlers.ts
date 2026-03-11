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
  const handleNew = useCallback(
    () => void manager.startNewConversation(),
    [manager],
  );
  const handleSelect = useCallback(
    (id: string) => void manager.switchConversation(id),
    [manager],
  );
  const handleDelete = useCallback(
    (id: string) => void manager.deleteConversation(id),
    [manager],
  );
  const handleRename = useCallback(
    (id: string, title: string | null) =>
      void manager.renameConversation(id, title),
    [manager],
  );
  const handleToggleBookmark = useCallback(
    (id: string) => void manager.toggleBookmark(id),
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
