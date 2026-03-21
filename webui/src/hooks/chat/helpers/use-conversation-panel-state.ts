// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo } from "preact/hooks";
import { type ConversationPanelState } from "#webui/components/chat/ChatScreen";
import { type UseConversationsReturn } from "#webui/hooks/chat/use-conversations";
import { type ViewState } from "#webui/hooks/use-view-state";
import { isMobile } from "#webui/utils/is-mobile";

interface ConversationPanelDeps {
  conversationManager: UseConversationsReturn;
  transfer: {
    notification: UseConversationsReturn["limitNotification"];
    dismissNotification: () => void;
    handleExportOne: (id: string) => Promise<void>;
    handleExport: () => Promise<void>;
    handleImport: () => Promise<void>;
  };
  viewState: ViewState;
  setViewState: (patch: Partial<ViewState>) => void;
  handlers: {
    handleNew: () => void;
    handleSelect: (id: string) => void;
    handleDelete: (id: string) => void;
    handleRename: (id: string, title: string | null) => void;
    handleToggleBookmark: (id: string) => void;
  };
}

/**
 * Assembles the ConversationPanelState prop object for ChatScreen.
 * @param deps - Data sources and handlers needed by the conversation panel
 * @returns A memoized ConversationPanelState
 */
export function useConversationPanelState(
  deps: ConversationPanelDeps,
): ConversationPanelState {
  const { conversationManager, transfer, viewState, setViewState, handlers } =
    deps;

  return useMemo(
    (): ConversationPanelState => ({
      conversations: conversationManager.conversations,
      activeConversationId: conversationManager.activeConversationId,
      isOpen: viewState.historyPanelOpen,
      onToggle: () =>
        setViewState({ historyPanelOpen: !viewState.historyPanelOpen }),
      onSelect: (id: string) => {
        handlers.handleSelect(id);
        if (isMobile()) setViewState({ historyPanelOpen: false });
      },
      onNew: () => {
        handlers.handleNew();
        if (isMobile()) setViewState({ historyPanelOpen: false });
      },
      onDelete: handlers.handleDelete,
      onExportItem: transfer.handleExportOne,
      onRename: handlers.handleRename,
      onToggleBookmark: handlers.handleToggleBookmark,
      onExport: () => void transfer.handleExport(),
      onImport: () => void transfer.handleImport(),
      notification:
        transfer.notification ?? conversationManager.limitNotification,
      onDismissNotification: transfer.notification
        ? transfer.dismissNotification
        : conversationManager.dismissLimitNotification,
    }),
    [conversationManager, transfer, viewState, setViewState, handlers],
  );
}
