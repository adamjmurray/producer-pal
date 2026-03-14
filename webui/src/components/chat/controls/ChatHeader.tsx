// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { VERSION } from "#src/shared/version";
import logoSvg from "#webui/assets/producer-pal-logo.svg";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { HeaderActions, type HeaderInfo } from "./header/HeaderActions";
import {
  BookmarkIcon,
  NewConversationIcon,
  PanelToggleIcon,
} from "./header/HeaderIcons";
import { HeaderStatus } from "./header/HeaderStatus";
import { VersionDisplay } from "./header/VersionDisplay";

const iconBtn =
  "p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors";

interface ChatHeaderProps {
  headerInfo: HeaderInfo;
  mcpStatus: McpStatus;
  isHistoryOpen: boolean;
  isActiveBookmarked?: boolean;
  latestVersion: string | null;
  onOpenSettings: () => void;
  onOpenToolsSettings: () => void;
  onOpenConnectionSettings: () => void;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  onToggleBookmark?: () => void;
}

/**
 * Header component for chat UI with responsive layout
 * @param props - ChatHeaderProps
 * @param props.headerInfo - Header display state (model/provider/tools/small-model info)
 * @param props.mcpStatus - MCP connection status
 * @param props.isHistoryOpen - Whether conversation history panel is open
 * @param props.isActiveBookmarked - Whether the active conversation is bookmarked
 * @param props.latestVersion - Latest available version, or null if up to date
 * @param props.onOpenSettings - Callback to open settings
 * @param props.onOpenToolsSettings - Callback to open tools settings tab
 * @param props.onOpenConnectionSettings - Callback to open connection settings tab
 * @param props.onToggleHistory - Callback to toggle history panel
 * @param props.onNewConversation - Callback to start new conversation
 * @param props.onToggleBookmark - Callback to toggle bookmark
 * @returns Header element
 */
export function ChatHeader({
  headerInfo,
  mcpStatus,
  isHistoryOpen,
  isActiveBookmarked,
  latestVersion,
  onOpenSettings,
  onOpenToolsSettings,
  onOpenConnectionSettings,
  onToggleHistory,
  onNewConversation,
  onToggleBookmark,
}: ChatHeaderProps) {
  return (
    <header className="bg-zinc-200 dark:bg-zinc-800 px-4 py-2 border-b border-zinc-400 dark:border-zinc-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] flex items-center gap-2 relative z-20">
      <div className="flex items-center gap-0.75 -ml-2">
        <button
          onClick={onToggleHistory}
          className={iconBtn}
          aria-label="Toggle conversation history"
          title="Conversation history"
        >
          <PanelToggleIcon isOpen={isHistoryOpen} />
        </button>
        <button
          onClick={onNewConversation}
          className={iconBtn}
          aria-label="New conversation"
          title="New conversation"
        >
          <NewConversationIcon />
        </button>
        <button
          onClick={onToggleBookmark}
          className={`${iconBtn}${isActiveBookmarked ? " text-amber-400! dark:text-amber-400!" : ""}${onToggleBookmark ? "" : " opacity-30 cursor-default!"}`}
          disabled={!onToggleBookmark}
          aria-label={
            isActiveBookmarked ? "Remove bookmark" : "Bookmark conversation"
          }
          title={
            isActiveBookmarked ? "Remove bookmark" : "Bookmark conversation"
          }
        >
          <BookmarkIcon bookmarked={isActiveBookmarked ?? false} />
        </button>
      </div>

      <a
        href="https://producer-pal.org"
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex items-center pl-7 lg:pl-9 ml-2.5 hover:opacity-80 transition-opacity no-underline shrink-0"
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
      </a>
      <VersionDisplay version={VERSION} latestVersion={latestVersion} />

      <div className="flex gap-1 text-xs">
        <HeaderStatus mcpStatus={mcpStatus} />
      </div>

      <HeaderActions
        headerInfo={headerInfo}
        onOpenSettings={onOpenSettings}
        onOpenToolsSettings={onOpenToolsSettings}
        onOpenConnectionSettings={onOpenConnectionSettings}
      />
    </header>
  );
}
