// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { DisclosureChevron } from "#webui/components/chat/controls/header/HeaderIcons";
import { ConversationItem } from "#webui/components/chat/ConversationItem";
import { type ConversationSummary } from "#webui/lib/conversation-db";

export interface ConversationListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExportItem: (id: string) => void | Promise<void>;
  onRename: (id: string, title: string | null) => void;
  onToggleBookmark: (id: string) => void;
}

/**
 * Scrollable list of conversations with bookmarks and collapsible sections.
 * @param props - Component props
 * @param props.conversations - List of conversation summaries
 * @param props.activeConversationId - Currently active conversation ID
 * @param props.onSelect - Callback when a conversation is selected
 * @param props.onDelete - Callback to delete a conversation
 * @param props.onExportItem - Callback to export a single conversation
 * @param props.onRename - Callback to rename a conversation
 * @param props.onToggleBookmark - Callback to toggle bookmark on a conversation
 * @returns Conversation list component
 */
export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onDelete,
  onExportItem,
  onRename,
  onToggleBookmark,
}: ConversationListProps) {
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
        onExport={onExportItem}
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
    <div className="flex-1 overflow-y-auto">
      {conversations.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
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
      className="w-full px-4 py-1.5 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center gap-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
    >
      <span className={`transition-transform ${collapsed ? "" : "rotate-90"}`}>
        <DisclosureChevron />
      </span>
      <span className="text-[10px] text-zinc-600 dark:text-zinc-300 uppercase tracking-wide">
        {label} ({count})
      </span>
    </button>
  );
}
