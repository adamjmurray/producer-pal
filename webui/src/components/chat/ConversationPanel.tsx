// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { NewConversationIcon } from "#webui/components/chat/controls/header/HeaderIcons";
import { type ConversationSummary } from "#webui/lib/conversation-db";
import {
  formatTimestampDate,
  formatTimestampTime,
} from "#webui/lib/utils/format-timestamp";

interface ConversationPanelProps {
  isOpen: boolean;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string | null) => void;
  onToggleBookmark: (id: string) => void;
}

/**
 * Slide-out panel showing conversation history list.
 * Overlays on top of chat content.
 * @param props - Panel configuration and callbacks
 * @param props.isOpen - Whether the panel is expanded
 * @param props.conversations - List of conversation summaries
 * @param props.activeConversationId - Currently active conversation ID
 * @param props.onSelect - Callback when a conversation is selected
 * @param props.onNewConversation - Callback to start a new conversation
 * @param props.onDelete - Callback to delete a conversation
 * @param props.onRename - Callback to rename a conversation
 * @param props.onToggleBookmark - Callback to toggle bookmark on a conversation
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
}: ConversationPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const bookmarked = conversations.filter((c) => c.bookmarked);
  const unbookmarked = conversations.filter((c) => !c.bookmarked);

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
        {/* New conversation + info */}
        <div className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center gap-2">
          <button
            onClick={onNewConversation}
            className="flex-1 flex items-center justify-center gap-1 text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <NewConversationIcon /> New Conversation
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
              No conversations yet
            </p>
          ) : (
            <>
              {renderItems(bookmarked)}

              {bookmarked.length > 0 && unbookmarked.length > 0 && (
                <div className="px-4 py-1.5 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                    Other conversations
                  </span>
                </div>
              )}

              {renderItems(unbookmarked)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Small star icon button for toggling bookmark state.
 * @param props - Component props
 * @param props.bookmarked - Whether the conversation is bookmarked
 * @param props.onClick - Click handler
 * @returns Star button element
 */
function BookmarkStar({
  bookmarked,
  onClick,
}: {
  bookmarked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`pl-3 pr-0.5 py-1 transition-colors ${
        bookmarked
          ? "text-amber-400 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
          : "text-gray-300 hover:text-amber-400 dark:text-gray-600 dark:hover:text-amber-400"
      }`}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark conversation"}
      title={bookmarked ? "Remove bookmark" : "Bookmark conversation"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 1.5l1.4 2.8 3.1.5-2.25 2.2.5 3.1L6 8.7 3.25 10.1l.5-3.1L1.5 4.8l3.1-.5z" />
      </svg>
    </button>
  );
}

interface ConversationItemProps {
  conv: ConversationSummary;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onEditStart: () => void;
  onEditChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}

/**
 * Single conversation row in the sidebar panel.
 * @param props - Item props
 * @param props.conv - Conversation summary data
 * @param props.isActive - Whether this is the active conversation
 * @param props.isEditing - Whether the title is being edited
 * @param props.editValue - Current edit input value
 * @param props.onSelect - Select callback
 * @param props.onDelete - Delete callback
 * @param props.onToggleBookmark - Toggle bookmark callback
 * @param props.onEditStart - Start editing callback
 * @param props.onEditChange - Edit value change callback
 * @param props.onEditCommit - Commit edit callback
 * @param props.onEditCancel - Cancel edit callback
 * @returns Conversation item element
 */
function ConversationItem({
  conv,
  isActive,
  isEditing,
  editValue,
  onSelect,
  onDelete,
  onToggleBookmark,
  onEditStart,
  onEditChange,
  onEditCommit,
  onEditCancel,
}: ConversationItemProps) {
  const displayTitle =
    conv.title ??
    `${formatTimestampDate(conv.createdAt)}, ${formatTimestampTime(conv.createdAt)}`;

  return (
    <button
      onClick={() => onSelect(conv.id)}
      className={`w-full text-left border-b border-gray-100 dark:border-gray-800 transition-colors ${
        isActive
          ? "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-blue-500"
          : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex items-center">
        <BookmarkStar
          bookmarked={conv.bookmarked}
          onClick={() => onToggleBookmark(conv.id)}
        />
        <div className="flex-1 text-left pr-4 pt-2 pb-0.5 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onInput={(e) =>
                onEditChange((e.target as HTMLInputElement).value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditCommit();
                if (e.key === "Escape") onEditCancel();
              }}
              onBlur={onEditCommit}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-xs px-1 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none"
              autoFocus
            />
          ) : (
            <div
              className={`text-xs truncate ${isActive ? "font-medium text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}
            >
              {displayTitle}
            </div>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onEditStart();
          }}
          className="px-1 py-1 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
          aria-label="Rename conversation"
          title="Rename conversation"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8.5 1.5l2 2M1 11l.5-2L8.5 2l2 2-7 7-2 .5z" />
          </svg>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(conv.id);
          }}
          className="pr-3 pl-1 py-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
          aria-label="Delete conversation"
          title="Delete conversation"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3.5h10M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M11 3.5l-.5 8a1 1 0 01-1 1h-5a1 1 0 01-1-1L3 3.5" />
          </svg>
        </button>
      </div>

      <div className="w-full text-left px-4 pt-0.5 pb-2">
        <div className="text-[10px] text-gray-400 dark:text-gray-500">
          {formatTimestampDate(conv.createdAt)},{" "}
          {formatTimestampTime(conv.createdAt)}
        </div>
      </div>
    </button>
  );
}
