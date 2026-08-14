// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ExportIcon,
  ImportIcon,
  NewConversationIcon,
  SearchIcon,
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
  onSearchChange: (query: string) => void;
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
 * @param props.searchQuery - Current search query text
 * @param props.matchedIds - IDs matching the active search, or null when not searching
 * @param props.onSelect - Callback when a conversation is selected
 * @param props.onNewConversation - Callback to start a new conversation
 * @param props.onSearchChange - Callback when the search query changes
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
  searchQuery,
  matchedIds,
  onSelect,
  onNewConversation,
  onSearchChange,
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
      className={`h-full shrink-0 overflow-hidden transition-[width,flex-basis,min-width] duration-200 ${isOpen ? "w-full sm:w-auto sm:max-w-5xl sm:min-w-64 sm:grow sm:basis-64" : "w-0 sm:w-auto sm:min-w-0 sm:grow-0 sm:basis-0"}`}
    >
      <div
        className={`relative z-10 flex h-full w-full min-w-screen flex-col border-r border-zinc-400 bg-zinc-200 shadow-[3px_0_10px_-2px_rgba(0,0,0,0.12)] transition-transform duration-200 sm:min-w-64 dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[3px_0_10px_-2px_rgba(0,0,0,0.4)] ${isOpen ? "" : "-translate-x-full"}`}
      >
        <PanelToolbar
          onNewConversation={onNewConversation}
          onExport={onExport}
          onImport={onImport}
        />

        {conversations.length > 0 && (
          <SearchBar value={searchQuery} onChange={onSearchChange} />
        )}

        {notification && (
          <TransferNotification
            notification={notification}
            onDismiss={onDismissNotification}
          />
        )}

        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          searchQuery={searchQuery}
          matchedIds={matchedIds}
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
 * Search field for filtering the conversation list by title and message text.
 * @param props - Component props
 * @param props.value - Current search query
 * @param props.onChange - Callback when the query changes
 * @returns Search input row
 */
function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (query: string) => void;
}) {
  return (
    <div className="border-b border-zinc-300 px-2 py-2 dark:border-zinc-700">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
          <SearchIcon />
        </span>

        <input
          type="text"
          value={value}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
          className="w-full rounded-lg border border-zinc-300 bg-white py-1.5 pr-7 pl-7 text-xs text-zinc-800 placeholder:text-zinc-400 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />

        {value && (
          <button
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-200"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

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
    <div className="flex items-center gap-1.5 border-b border-zinc-300 px-2 py-2 dark:border-zinc-700">
      <button
        onClick={onNewConversation}
        className="flex max-w-48 items-center justify-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs whitespace-nowrap text-white transition-colors hover:bg-blue-600"
      >
        <NewConversationIcon /> New Conversation
      </button>
      <div className="flex-1" />
      <button
        onClick={onExport}
        className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-blue-500 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
        aria-label="Export conversations"
        title="Export conversations"
      >
        <ExportIcon />
      </button>
      <button
        onClick={onImport}
        className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-blue-500 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
        aria-label="Import conversations"
        title="Import conversations"
      >
        <ImportIcon />
      </button>
    </div>
  );
}
