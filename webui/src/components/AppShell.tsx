// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ComponentChildren } from "preact";
import { ChatHeader } from "#webui/components/chat/controls/ChatHeader";
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";
import {
  ConversationPanel,
  type ConversationPanelProps,
} from "#webui/components/chat/ConversationPanel";
import { useUpdateCheck } from "#webui/hooks/use-update-check";

/** State and handlers for the conversation history panel.
 * Extends ConversationPanelProps with renamed callbacks and panel toggle state. */
export interface ConversationPanelState extends Omit<
  ConversationPanelProps,
  "onNewConversation"
> {
  onToggle: () => void;
  onNew: () => void;
}

interface AppShellProps {
  headerInfo: HeaderInfo;
  mcpStatus: "connected" | "connecting" | "error";
  conversationPanel: ConversationPanelState;
  onOpenSettings: () => void;
  onOpenToolsSettings: () => void;
  onOpenConnectionSettings: () => void;
  children: ComponentChildren;
}

/**
 * Shared app shell: header bar, conversation sidebar, and a card content area.
 * Both chat and voice screens render their composer + transcript inside.
 *
 * @param props - Shell props
 * @param props.headerInfo - Header display state (model, provider, tool counts)
 * @param props.mcpStatus - MCP connection status indicator
 * @param props.conversationPanel - Conversation history panel state + handlers
 * @param props.onOpenSettings - Open the settings modal on the default tab
 * @param props.onOpenToolsSettings - Open settings on the tools tab
 * @param props.onOpenConnectionSettings - Open settings on the connection tab
 * @param props.children - Content rendered inside the card body
 * @returns App shell element wrapping `children`
 */
export function AppShell({
  headerInfo,
  mcpStatus,
  conversationPanel,
  onOpenSettings,
  onOpenToolsSettings,
  onOpenConnectionSettings,
  children,
}: AppShellProps) {
  const latestVersion = useUpdateCheck();

  const activeConv = conversationPanel.activeConversationId
    ? conversationPanel.conversations.find(
        (c) => c.id === conversationPanel.activeConversationId,
      )
    : undefined;

  return (
    <div className="flex flex-col h-screen bg-zinc-100 dark:bg-zinc-950">
      <ChatHeader
        headerInfo={headerInfo}
        mcpStatus={mcpStatus}
        isHistoryOpen={conversationPanel.isOpen}
        isActiveBookmarked={activeConv?.bookmarked}
        latestVersion={latestVersion}
        onOpenSettings={onOpenSettings}
        onOpenToolsSettings={onOpenToolsSettings}
        onOpenConnectionSettings={onOpenConnectionSettings}
        onToggleHistory={conversationPanel.onToggle}
        onNewConversation={conversationPanel.onNew}
        onToggleBookmark={
          conversationPanel.activeConversationId
            ? () =>
                conversationPanel.onToggleBookmark(
                  conversationPanel.activeConversationId as string,
                )
            : undefined
        }
      />

      <div className="flex flex-1 min-h-0 justify-center">
        <ConversationPanel
          isOpen={conversationPanel.isOpen}
          conversations={conversationPanel.conversations}
          activeConversationId={conversationPanel.activeConversationId}
          onSelect={conversationPanel.onSelect}
          onNewConversation={conversationPanel.onNew}
          onDelete={conversationPanel.onDelete}
          onExportItem={conversationPanel.onExportItem}
          onRename={conversationPanel.onRename}
          onToggleBookmark={conversationPanel.onToggleBookmark}
          onExport={conversationPanel.onExport}
          onImport={conversationPanel.onImport}
          notification={conversationPanel.notification}
          onDismissNotification={conversationPanel.onDismissNotification}
        />

        <div
          className={`flex flex-col flex-9999 min-w-0 max-w-5xl ${conversationPanel.isOpen ? "hidden sm:flex" : ""}`}
        >
          <div className="flex flex-col flex-1 min-h-0 w-full border-x border-zinc-300 dark:border-zinc-700 shadow-lg dark:shadow-black/40 bg-white dark:bg-zinc-900">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
