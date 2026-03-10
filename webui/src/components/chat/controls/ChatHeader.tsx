// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { VERSION } from "#src/shared/version";
import logoSvg from "#webui/assets/producer-pal-logo.svg";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { CHAT_UI_DOCS_URL, getModelName } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";
import { getProviderName } from "./header/header-helpers";
import {
  BookmarkIcon,
  NewConversationIcon,
  PanelToggleIcon,
  SettingsIcon,
} from "./header/HeaderIcons";
import { HeaderStatus } from "./header/HeaderStatus";
import { SmallModelIndicator } from "./header/SmallModelIndicator";
import { ToolsIndicator } from "./header/ToolsIndicator";
import { VersionDisplay } from "./header/VersionDisplay";

const iconBtn =
  "p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors";

const helpBtn =
  "inline-flex items-center justify-center w-5 h-5 text-xs font-semibold leading-none rounded-full border border-stone-400 dark:border-stone-500 text-stone-500 dark:text-stone-400 hover:border-stone-200 hover:text-white dark:hover:border-stone-300 dark:hover:text-white no-underline shrink-0";

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
  showHelpLinks: boolean;
  latestVersion: string | null;
  onOpenSettings: () => void;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  onToggleBookmark?: () => void;
}

/**
 * Header component for chat UI with responsive layout
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
 * @param props.showHelpLinks - Whether to show help link buttons
 * @param props.latestVersion - Latest available version, or null if up to date
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
  showHelpLinks,
  latestVersion,
  onOpenSettings,
  onToggleHistory,
  onNewConversation,
  onToggleBookmark,
}: ChatHeaderProps) {
  return (
    <header className="bg-stone-200 dark:bg-stone-800 px-4 py-2 border-b border-stone-400 dark:border-stone-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] flex items-center gap-2 relative z-20">
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

      <div className="ml-auto flex gap-2 sm:gap-3 items-center">
        <span className="text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap truncate min-w-0 max-w-28 sm:max-w-48 md:max-w-none">
          <span className="hidden sm:inline">
            {getProviderName(activeProvider ?? provider)} |{" "}
          </span>
          {getModelName(activeModel ?? model)}
        </span>

        <ToolsIndicator
          enabledToolsCount={enabledToolsCount}
          totalToolsCount={totalToolsCount}
        />

        <SmallModelIndicator active={smallModelMode} />

        <button
          onClick={onOpenSettings}
          className={iconBtn}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
        {showHelpLinks && (
          <a
            href={CHAT_UI_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={helpBtn}
            title="Documentation"
          >
            ?
          </a>
        )}
      </div>
    </header>
  );
}
