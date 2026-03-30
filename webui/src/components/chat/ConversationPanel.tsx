// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ExportIcon,
  ImportIcon,
  NewConversationIcon,
} from "#webui/components/chat/controls/header/HeaderIcons";
import {
  ConversationList,
  type ConversationListProps,
} from "#webui/components/chat/ConversationList";
import {
  TransferNotification,
  type TransferNotificationData,
} from "#webui/components/chat/TransferNotification";

export interface ConversationPanelProps extends ConversationListProps {
  isOpen: boolean;
  onNewConversation: () => void;
  onExport: () => void;
  onImport: () => void;
  notification: TransferNotificationData | null;
  onDismissNotification: () => void;
}

/**
 * Slide-out panel showing conversation history list.
 * @param props - Panel configuration and callbacks
 * @param props.isOpen - Whether the panel is expanded
 * @param props.conversations - List of conversation summaries
 * @param props.activeConversationId - Currently active conversation ID
 * @param props.onSelect - Callback when a conversation is selected
 * @param props.onNewConversation - Callback to start a new conversation
 * @param props.onDelete - Callback to delete a conversation
 * @param props.onExportItem - Callback to export a single conversation
 * @param props.onRename - Callback to rename a conversation
 * @param props.onToggleBookmark - Callback to toggle bookmark on a conversation
 * @param props.onExport - Callback to export all conversations
 * @param props.onImport - Callback to import conversations from file
 * @param props.notification - Transfer notification to display
 * @param props.onDismissNotification - Callback to dismiss the notification
 * @returns Panel component
 */
export function ConversationPanel({
  isOpen,
  conversations,
  activeConversationId,
  onSelect,
  onNewConversation,
  onDelete,
  onExportItem,
  onRename,
  onToggleBookmark,
  onExport,
  onImport,
  notification,
  onDismissNotification,
}: ConversationPanelProps) {
  return (
    <div
      className={`shrink-0 h-full overflow-hidden transition-[width,flex-basis,min-width] duration-200 ${isOpen ? "w-full sm:w-auto sm:grow sm:basis-64 sm:min-w-64 sm:max-w-5xl" : "w-0 sm:w-auto sm:grow-0 sm:basis-0 sm:min-w-0"}`}
    >
      <div
        className={`w-full min-w-screen sm:min-w-64 h-full bg-zinc-200 dark:bg-zinc-900 border-r border-zinc-400 dark:border-zinc-700 shadow-[3px_0_10px_-2px_rgba(0,0,0,0.12)] dark:shadow-[3px_0_10px_-2px_rgba(0,0,0,0.4)] flex flex-col relative z-10 transition-transform duration-200 ${isOpen ? "" : "-translate-x-full"}`}
      >
        <PanelToolbar
          onNewConversation={onNewConversation}
          onExport={onExport}
          onImport={onImport}
        />

        {notification && (
          <TransferNotification
            notification={notification}
            onDismiss={onDismissNotification}
          />
        )}

        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={onSelect}
          onDelete={onDelete}
          onExportItem={onExportItem}
          onRename={onRename}
          onToggleBookmark={onToggleBookmark}
        />
      </div>
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Toolbar with new conversation, export, and import buttons.
 * @param props - Component props
 * @param props.onNewConversation - Callback to start a new conversation
 * @param props.onExport - Callback to export conversations
 * @param props.onImport - Callback to import conversations
 * @returns Toolbar component
 */
function PanelToolbar({
  onNewConversation,
  onExport,
  onImport,
}: {
  onNewConversation: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <div className="px-2 py-2 border-b border-zinc-300 dark:border-zinc-700 flex items-center gap-1.5">
      <button
        onClick={onNewConversation}
        className="max-w-48 flex items-center justify-center gap-1 text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap"
      >
        <NewConversationIcon /> New Conversation
      </button>
      <div className="flex-1" />
      <button
        onClick={onExport}
        className="p-1.5 text-zinc-400 hover:text-blue-500 dark:text-zinc-500 dark:hover:text-blue-400 transition-colors rounded hover:bg-zinc-200 dark:hover:bg-zinc-800"
        aria-label="Export conversations"
        title="Export conversations"
      >
        <ExportIcon />
      </button>
      <button
        onClick={onImport}
        className="p-1.5 text-zinc-400 hover:text-blue-500 dark:text-zinc-500 dark:hover:text-blue-400 transition-colors rounded hover:bg-zinc-200 dark:hover:bg-zinc-800"
        aria-label="Import conversations"
        title="Import conversations"
      >
        <ImportIcon />
      </button>
    </div>
  );
}
