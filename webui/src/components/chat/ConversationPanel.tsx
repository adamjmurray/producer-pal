// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import {
  DisclosureChevron,
  ExportIcon,
  ImportIcon,
  NewConversationIcon,
} from "#webui/components/chat/controls/header/HeaderIcons";
import { ConversationItem } from "#webui/components/chat/ConversationItem";
import {
  TransferNotification,
  type TransferNotificationData,
} from "#webui/components/chat/TransferNotification";
import { type ConversationSummary } from "#webui/lib/conversation-db";

export interface ConversationPanelProps {
  isOpen: boolean;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string | null) => void;
  onToggleBookmark: (id: string) => void;
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
  onRename,
  onToggleBookmark,
  onExport,
  onImport,
  notification,
  onDismissNotification,
}: ConversationPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [bookmarksCollapsed, setBookmarksCollapsed] = useState(false);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const bookmarked = conversations.filter((c) => c.bookmarked);

  const renderItems = (items: ConversationSummary[]) =>
    items.map((conv) => (
      <ConversationItem
        key={conv.id}
        conv={conv}
        isActive={conv.id === activeConversationId}
        isEditing={conv.id === editingId}
        editValue={editValue}
        onSelect={onSelect}
        onDelete={onDelete}
        onToggleBookmark={onToggleBookmark}
        onEditStart={() => {
          setEditingId(conv.id);
          setEditValue(conv.title ?? "");
        }}
        onEditChange={setEditValue}
        onEditCommit={() => {
          const trimmed = editValue.trim();

          onRename(conv.id, trimmed || null);
          setEditingId(null);
        }}
        onEditCancel={() => setEditingId(null)}
      />
    ));

  return (
    <div
      className={`shrink-0 h-full overflow-hidden transition-[width] duration-200 ${isOpen ? "w-full md:w-72" : "w-0"}`}
    >
      <div className="w-full md:w-72 h-full bg-white dark:bg-gray-900 border-r border-gray-300 dark:border-gray-700 flex flex-col">
        {/* New conversation + export/import */}
        <div className="px-2 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center gap-1.5">
          <button
            onClick={onNewConversation}
            className="flex-1 flex items-center justify-center gap-1 text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <NewConversationIcon /> New Conversation
          </button>
          <button
            onClick={onExport}
            className="p-1.5 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Export conversations"
            title="Export conversations"
          >
            <ExportIcon />
          </button>
          <button
            onClick={onImport}
            className="p-1.5 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Import conversations"
            title="Import conversations"
          >
            <ImportIcon />
          </button>
        </div>

        {notification && (
          <TransferNotification
            notification={notification}
            onDismiss={onDismissNotification}
          />
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
              No conversations yet
            </p>
          ) : (
            <>
              {bookmarked.length > 0 && (
                <>
                  <SectionHeader
                    label="Bookmarks"
                    count={bookmarked.length}
                    collapsed={bookmarksCollapsed}
                    onToggle={() => setBookmarksCollapsed(!bookmarksCollapsed)}
                  />
                  {!bookmarksCollapsed && renderItems(bookmarked)}
                </>
              )}

              <SectionHeader
                label="All Conversations"
                count={conversations.length}
                collapsed={allCollapsed}
                onToggle={() => setAllCollapsed(!allCollapsed)}
              />
              {!allCollapsed && renderItems(conversations)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Collapsible section header for conversation sublists.
 * @param props - Component props
 * @param props.label - Section label text
 * @param props.count - Number of conversations in this section
 * @param props.collapsed - Whether the section is collapsed
 * @param props.onToggle - Toggle collapse callback
 * @returns Section header button element
 */
function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center gap-1.5 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
    >
      <span className={`transition-transform ${collapsed ? "" : "rotate-90"}`}>
        <DisclosureChevron />
      </span>
      <span className="text-[10px] text-gray-600 dark:text-gray-300 uppercase tracking-wide">
        {label} ({count})
      </span>
    </button>
  );
}
