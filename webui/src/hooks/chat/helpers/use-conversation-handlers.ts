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
 * @param clearViewingMode - Clears any foreign-mode view override so the next
 *   fresh session honors the user's saved mode
 * @returns Stable callback handlers for conversation operations
 */
export function useConversationHandlers(
  manager: UseConversationsReturn,
  stopResponse: () => void,
  clearViewingMode: () => void,
) {
  const handleNew = useCallback(() => {
    stopResponse();
    manager.startNewConversation();
    clearViewingMode();
  }, [manager, stopResponse, clearViewingMode]);
  const handleSelect = useCallback(
    (id: string) => {
      stopResponse();
      manager.switchConversation(id).catch(console.error);
    },
    [manager, stopResponse],
  );
  const handleDelete = useCallback(
    (id: string) => {
      // Only stop the stream when deleting the *active* conversation. Autosaves
      // only ever target the active id (saveCurrentConversation reuses
      // activeIdRef, minting a new id only for a fork or brand-new chat, which it
      // then makes active), so a non-active row has no pending save to resurrect.
      // Stopping unconditionally would needlessly abort the user's in-flight
      // response and, mid-fork, let the teardown autosave overwrite the source
      // record with the fork's truncated history. deleteConversation's own drain
      // plus the canceledIds guard cover the active-delete resurrection case.
      if (id === manager.activeConversationId) stopResponse();
      manager.deleteConversation(id).catch(console.error);
    },
    [manager, stopResponse],
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
