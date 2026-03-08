// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CHAT_UI_DOCS_URL } from "#webui/lib/config";
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
 * @returns Panel component
 */
export function ConversationPanel({
  isOpen,
  conversations,
  activeConversationId,
  onSelect,
  onNewConversation,
  onDelete,
}: ConversationPanelProps) {
  return (
    <div
      className={`shrink-0 h-full overflow-hidden transition-[width] duration-200 ${isOpen ? "w-72" : "w-0"}`}
    >
      <div className="w-72 h-full bg-white dark:bg-gray-900 border-r border-gray-300 dark:border-gray-700 flex flex-col">
        {/* New conversation + info */}
        <div className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center gap-2">
          <button
            onClick={onNewConversation}
            className="flex-1 text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            + New Conversation
          </button>
          <a
            href={CHAT_UI_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-4 h-4 text-[10px] leading-none rounded-full border border-gray-400 dark:border-gray-500 text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 cursor-help no-underline shrink-0"
            title="Chat UI documentation"
          >
            i
          </a>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;

              return (
                <div
                  key={conv.id}
                  className={`flex items-center border-b border-gray-100 dark:border-gray-800 transition-colors ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-blue-500"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-l-transparent"
                  }`}
                >
                  <button
                    onClick={() => onSelect(conv.id)}
                    className="flex-1 text-left px-4 py-2.5"
                  >
                    <div
                      className={`text-xs ${isActive ? "font-medium text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      {formatTimestampDate(conv.createdAt)},{" "}
                      {formatTimestampTime(conv.createdAt)}
                    </div>
                  </button>

                  <button
                    onClick={() => onDelete(conv.id)}
                    className="pr-3 pl-1 py-2.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                    aria-label="Delete conversation"
                    title="Delete conversation"
                  >
                    <svg
                      width="14"
                      height="14"
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
