// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getProviderName } from "#webui/components/chat/controls/header/header-helpers";
import {
  EditIcon,
  ExportIconSmall,
  TrashIcon,
} from "#webui/components/chat/controls/header/HeaderIcons";
import { getModelName } from "#webui/lib/config";
import { type ConversationSummary } from "#webui/lib/conversation-db";
import { compactNumber } from "#webui/lib/utils/compact-number";
import {
  formatTimestampDate,
  formatTimestampTime,
} from "#webui/lib/utils/format-timestamp";
import { type Provider } from "#webui/types/settings";

export interface ConversationItemProps {
  conv: ConversationSummary;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void | Promise<void>;
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
 * @param props.onExport - Export single conversation callback
 * @param props.onToggleBookmark - Toggle bookmark callback
 * @param props.onEditStart - Start editing callback
 * @param props.onEditChange - Edit value change callback
 * @param props.onEditCommit - Commit edit callback
 * @param props.onEditCancel - Cancel edit callback
 * @returns Conversation item element
 */
export function ConversationItem({
  conv,
  isActive,
  isEditing,
  editValue,
  onSelect,
  onDelete,
  onExport,
  onToggleBookmark,
  onEditStart,
  onEditChange,
  onEditCommit,
  onEditCancel,
}: ConversationItemProps) {
  const displayTitle =
    conv.title ??
    `${formatTimestampDate(conv.updatedAt)}, ${formatTimestampTime(conv.updatedAt)}`;

  return (
    <button
      data-testid="conversation-item"
      onClick={() => onSelect(conv.id)}
      className={`w-full border-b border-zinc-100 text-left transition-colors dark:border-zinc-800 ${
        isActive
          ? "border-l-2 border-l-blue-500 bg-blue-50 dark:bg-blue-900/30"
          : "border-l-2 border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
      }`}
    >
      <div className="flex items-center">
        <BookmarkStar
          bookmarked={conv.bookmarked}
          onClick={() => onToggleBookmark(conv.id)}
        />
        <div className="min-w-0 flex-1 pt-2 pr-4 pb-0.5 text-left">
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              aria-label="Conversation title"
              onInput={(e) =>
                onEditChange((e.target as HTMLInputElement).value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditCommit();
                if (e.key === "Escape") onEditCancel();
              }}
              onBlur={onEditCommit}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded border border-blue-400 bg-white px-1 py-0.5 text-xs text-zinc-800 outline-none dark:bg-zinc-800 dark:text-zinc-200"
              autoFocus
            />
          ) : (
            <div
              className={`truncate text-xs ${isActive ? "font-medium text-blue-700 dark:text-blue-300" : "text-zinc-700 dark:text-zinc-300"}`}
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
          className="px-1 py-1 text-zinc-400 transition-colors hover:text-blue-500 dark:text-zinc-500 dark:hover:text-blue-400"
          aria-label="Rename conversation"
          title="Rename conversation"
        >
          <EditIcon />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            void onExport(conv.id);
          }}
          className="px-1 py-1 text-zinc-400 transition-colors hover:text-blue-500 dark:text-zinc-500 dark:hover:text-blue-400"
          aria-label="Export conversation"
          title="Export conversation"
        >
          <ExportIconSmall />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(conv.id);
          }}
          className="py-1 pr-3 pl-1 text-zinc-400 transition-colors hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
          aria-label="Delete conversation"
          title="Delete conversation"
        >
          <TrashIcon size={12} />
        </button>
      </div>

      <ConversationMeta conv={conv} />
    </button>
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
      className={`mt-1.5 self-start py-1 pr-1 pl-3 transition-colors ${
        bookmarked
          ? "text-amber-400 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
          : "text-zinc-300 hover:text-zinc-400 dark:text-zinc-600 dark:hover:text-zinc-400"
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

/**
 * Resolve the display label for a model using fallback order:
 * current label (from presets) → stored label → raw model ID.
 * @param modelId - Raw model identifier
 * @param storedLabel - Label persisted at conversation save time
 * @returns Human-readable model name
 */
function resolveModelLabel(
  modelId: string,
  storedLabel: string | null,
): string {
  const currentLabel = getModelName(modelId);

  if (currentLabel !== modelId) return currentLabel;

  return storedLabel ?? modelId;
}

/**
 * Timestamp and model metadata row for a conversation item.
 * @param props - Component props
 * @param props.conv - Conversation summary
 * @returns Metadata row element
 */
function ConversationMeta({ conv }: { conv: ConversationSummary }) {
  return (
    <div className="@container flex w-full gap-2 px-4 pt-0.5 pb-2 text-left text-[10px] text-zinc-400 dark:text-zinc-500">
      <div className="whitespace-nowrap">
        {formatTimestampDate(conv.updatedAt)},{" "}
        {formatTimestampTime(conv.updatedAt)}
      </div>
      {conv.sessionType === "voice" && (
        <span
          className="rounded-sm bg-blue-100 px-1.5 font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          title="Voice conversation"
        >
          Voice
        </span>
      )}
      {conv.totalUsage && (
        <div
          className="ml-2 hidden truncate @min-[20rem]:block"
          title="token usage (input [cached] → output)"
        >
          tokens: {compactNumber(conv.totalUsage.inputTokens ?? 0)}
          {(conv.totalUsage.cacheReadTokens ?? 0) > 0 &&
            ` (${compactNumber(conv.totalUsage.cacheReadTokens ?? 0)} cached)`}{" "}
          → {compactNumber(conv.totalUsage.outputTokens ?? 0)}
        </div>
      )}
      {conv.model && (
        <div className="ml-auto truncate text-right">
          {conv.provider
            ? `${getProviderName(conv.provider as Provider)} | `
            : ""}
          {resolveModelLabel(conv.model, conv.modelLabel)}
        </div>
      )}
    </div>
  );
}
