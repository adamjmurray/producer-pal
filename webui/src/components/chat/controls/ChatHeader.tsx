// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import logoSvg from "#webui/assets/producer-pal-logo.svg";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { CHAT_UI_DOCS_URL, getModelName } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";
import { getProviderName } from "./header/header-helpers";
import {
  BookmarkIcon,
  NewConversationIcon,
  PanelToggleIcon,
} from "./header/HeaderIcons";
import { HeaderStatus } from "./header/HeaderStatus";
import { ToolsIndicator } from "./header/ToolsIndicator";

const PPAL_VERSION = import.meta.env.PPAL_VERSION ?? "";

interface ChatHeaderProps {
  mcpStatus: McpStatus;
  activeModel: string | null;
  activeProvider: Provider | null;
  model: string;
  provider: Provider;
  enabledToolsCount: number;
  totalToolsCount: number;
  smallModelMode: boolean;
  isHistoryOpen: boolean;
  isActiveBookmarked?: boolean;
  onOpenSettings: () => void;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  onToggleBookmark?: () => void;
}

/**
 * Header component for chat UI
 * @param props - Component props
 * @param props.mcpStatus - MCP connection status
 * @param props.activeModel - Active model identifier
 * @param props.activeProvider - Active provider
 * @param props.model - Configured model
 * @param props.provider - Configured provider
 * @param props.enabledToolsCount - Number of enabled tools
 * @param props.totalToolsCount - Total number of available tools
 * @param props.smallModelMode - Whether small model mode is active
 * @param props.isHistoryOpen - Whether conversation history panel is open
 * @param props.isActiveBookmarked - Whether the active conversation is bookmarked
 * @param props.onOpenSettings - Callback to open settings
 * @param props.onToggleHistory - Callback to toggle history panel
 * @param props.onNewConversation - Callback to start new conversation
 * @param props.onToggleBookmark - Callback to toggle bookmark
 * @returns Header element
 */
export function ChatHeader({
  mcpStatus,
  activeModel,
  activeProvider,
  model,
  provider,
  enabledToolsCount,
  totalToolsCount,
  smallModelMode,
  isHistoryOpen,
  isActiveBookmarked,
  onOpenSettings,
  onToggleHistory,
  onNewConversation,
  onToggleBookmark,
}: ChatHeaderProps) {
  return (
    <header className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center gap-2">
      <div className="flex items-center gap-0.75 -ml-2">
        <button
          onClick={onToggleHistory}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          aria-label="Toggle conversation history"
          title="Conversation history"
        >
          <PanelToggleIcon isOpen={isHistoryOpen} />
        </button>

        <button
          onClick={onNewConversation}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          aria-label="New conversation"
          title="New conversation"
        >
          <NewConversationIcon />
        </button>

        {onToggleBookmark && (
          <button
            onClick={onToggleBookmark}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
            aria-label={
              isActiveBookmarked ? "Remove bookmark" : "Bookmark conversation"
            }
            title={
              isActiveBookmarked ? "Remove bookmark" : "Bookmark conversation"
            }
          >
            <BookmarkIcon bookmarked={isActiveBookmarked ?? false} />
          </button>
        )}
      </div>

      <a
        href="https://producer-pal.org"
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex items-center pl-7 lg:pl-9 ml-1.5 hover:opacity-80 transition-opacity no-underline shrink-0"
        title="Producer Pal website"
      >
        <img
          src={logoSvg}
          alt="Producer Pal"
          className="absolute left-0 h-5 scale-200"
        />
        <h1 className="hidden lg:inline text-lg font-semibold">
          Producer Pal Chat
        </h1>
        {PPAL_VERSION && (
          <span className="hidden lg:inline text-xs text-gray-500 dark:text-gray-400 ml-1.5 font-normal">
            v{PPAL_VERSION}
          </span>
        )}
      </a>

      <div className="flex gap-1 text-xs">
        <HeaderStatus mcpStatus={mcpStatus} />
      </div>

      <div className="ml-auto flex gap-3 items-baseline">
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap truncate min-w-0">
          <span className="hidden sm:inline">
            {getProviderName(activeProvider ?? provider)} |{" "}
          </span>
          {getModelName(activeModel ?? model)}
        </span>

        <ToolsIndicator
          enabledToolsCount={enabledToolsCount}
          totalToolsCount={totalToolsCount}
        />

        {smallModelMode && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            <span className="hidden sm:inline" aria-label="Small model mode">
              🐢 small model
            </span>
            <span className="sm:hidden" aria-label="Small model mode">
              🐢
            </span>
          </span>
        )}

        <button
          onClick={onOpenSettings}
          className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          ⚙<span className="hidden sm:inline"> Settings</span>
        </button>

        <a
          href={CHAT_UI_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-5 h-5 text-[11px] leading-none rounded-full border border-gray-400 dark:border-gray-500 text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 cursor-help no-underline shrink-0"
          title="Chat UI documentation"
        >
          i
        </a>
      </div>
    </header>
  );
}
