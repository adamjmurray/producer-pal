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
  /** Current search query; when non-empty, the list is filtered to matchedIds. */
  searchQuery: string;
  /** IDs matching the active search, or null when no search is active. */
  matchedIds: Set<string> | null;
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
 * @param props.searchQuery - Current search query (filters the list when non-empty)
 * @param props.matchedIds - IDs matching the active search, or null when not searching
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
  searchQuery,
  matchedIds,
  onSelect,
  onDelete,
  onExportItem,
  onRename,
  onToggleBookmark,
}: ConversationListProps) {
  // Section-namespaced (`${keyPrefix}-${conv.id}`), not the bare id: a
  // bookmarked conversation renders in BOTH the Bookmarks and All sections, so
  // keying edit mode by id alone put both instances into edit mode at once —
  // two autoFocus inputs fought for focus, and the blur committed the rename
  // before the user could type. Keying by the section makes exactly one edit.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [bookmarksCollapsed, setBookmarksCollapsed] = useState(false);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const query = searchQuery.trim();
  // matchedIds lags the query by one debounce tick; until it arrives, show all.
  const visible =
    query && matchedIds
      ? conversations.filter((c) => matchedIds.has(c.id))
      : conversations;
  const bookmarked = visible.filter((c) => c.bookmarked);

  // A bookmarked conversation renders in BOTH the Bookmarks and All sections
  // (bookmarked ⊆ visible), so the key must be namespaced per section — a bare
  // conv.id would collide across the two sibling lists (duplicate React keys).
  const renderItems = (items: ConversationSummary[], keyPrefix: string) =>
    items.map((conv) => {
      const itemKey = `${keyPrefix}-${conv.id}`;

      return (
        <ConversationItem
          key={itemKey}
          conv={conv}
          isActive={conv.id === activeConversationId}
          isEditing={itemKey === editingKey}
          editValue={editValue}
          onSelect={onSelect}
          onDelete={onDelete}
          onExport={onExportItem}
          onToggleBookmark={onToggleBookmark}
          onEditStart={() => {
            setEditingKey(itemKey);
            setEditValue(conv.title ?? "");
          }}
          onEditChange={setEditValue}
          onEditCommit={() => {
            const trimmed = editValue.trim();

            onRename(conv.id, trimmed || null);
            setEditingKey(null);
          }}
          onEditCancel={() => setEditingKey(null)}
        />
      );
    });

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.length === 0 ? (
        <EmptyState message="No conversations yet" />
      ) : query && visible.length === 0 ? (
        <EmptyState message={`No conversations match “${query}”`} />
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
              {!bookmarksCollapsed && renderItems(bookmarked, "bookmark")}
            </>
          )}

          <SectionHeader
            label="All Conversations"
            count={visible.length}
            collapsed={allCollapsed}
            onToggle={() => setAllCollapsed(!allCollapsed)}
          />
          {!allCollapsed && renderItems(visible, "all")}
        </>
      )}
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Placeholder message shown when the list is empty or a search has no matches.
 * @param props - Component props
 * @param props.message - Text to display
 * @returns Empty-state paragraph element
 */
function EmptyState({ message }: { message: string }) {
  return (
    <p className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
      {message}
    </p>
  );
}

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
      className="flex w-full items-center gap-1.5 border-b border-zinc-200 bg-zinc-100 px-4 py-1.5 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
    >
      <span className={`transition-transform ${collapsed ? "" : "rotate-90"}`}>
        <DisclosureChevron />
      </span>
      <span className="text-[10px] tracking-wide text-zinc-600 uppercase dark:text-zinc-300">
        {label} ({count})
      </span>
    </button>
  );
}
