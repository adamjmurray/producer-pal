// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import logoSvg from "#webui/assets/producer-pal-logo.svg";
import { getModelName } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";

interface ChatHeaderProps {
  mcpStatus: "connected" | "connecting" | "error";
  activeModel: string | null;
  activeProvider: Provider | null;
  model: string;
  provider: Provider;
  enabledToolsCount: number;
  totalToolsCount: number;
  smallModelMode: boolean;
  isHistoryOpen: boolean;
  onOpenSettings: () => void;
  onToggleHistory: () => void;
  onNewConversation: () => void;
}

/**
 * Pen-on-paper icon for new conversation
 * @returns SVG element
 */
export function NewConversationIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2.5l2.5 2.5-8.75 8.75H6.25v-2.5L15 2.5z" />
      <path d="M3.75 17.5h12.5" />
    </svg>
  );
}

/**
 * Panel toggle icon showing sidebar with list lines
 * @param props - Component props
 * @param props.isOpen - Whether the panel is open
 * @returns SVG element
 */
function PanelToggleIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="16" height="16" rx="2.5" />
      <line x1="8" y1="2" x2="8" y2="18" />
      {isOpen ? (
        <>
          <rect
            x="2.75"
            y="2.75"
            width="5.25"
            height="14.5"
            rx="1.5"
            fill="currentColor"
            stroke="none"
          />
          <line
            x1="4"
            y1="7"
            x2="7"
            y2="7"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line
            x1="4"
            y1="10"
            x2="7"
            y2="10"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line
            x1="4"
            y1="13"
            x2="7"
            y2="13"
            stroke="currentColor"
            strokeWidth="1"
          />
        </>
      ) : (
        <>
          <line x1="4.5" y1="7" x2="6.5" y2="7" strokeWidth="1" />
          <line x1="4.5" y1="10" x2="6.5" y2="10" strokeWidth="1" />
          <line x1="4.5" y1="13" x2="6.5" y2="13" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

/**
 * Gets display name for provider
 * @param {Provider} provider - Provider identifier
 * @returns {JSX.Element} - React component
 */
function getProviderName(provider: Provider): string {
  switch (provider) {
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return "Google";
    case "openai":
      return "OpenAI";
    case "mistral":
      return "Mistral";
    case "openrouter":
      return "OpenRouter";
    case "lmstudio":
      return "LM Studio";
    case "ollama":
      return "Ollama";
    case "custom":
      return "Custom";
  }
}

/**
 * Header component for chat UI
 * @param {ChatHeaderProps} props - Component props
 * @param {"connected" | "connecting" | "error"} props.mcpStatus - MCP connection status
 * @param {string | null} props.activeModel - Active model identifier
 * @param {Provider | null} props.activeProvider - Active provider
 * @param {number} props.enabledToolsCount - Number of enabled tools
 * @param {number} props.totalToolsCount - Total number of available tools
 * @param {boolean} props.smallModelMode - Whether small model mode is active
 * @param {() => void} props.onOpenSettings - Callback to open settings
 * @returns {JSX.Element} - React component
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
  onOpenSettings,
  onToggleHistory,
  onNewConversation,
}: ChatHeaderProps) {
  return (
    <header className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center gap-3">
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
      </div>

      <button
        onClick={onToggleHistory}
        className="relative flex items-center pl-9 ml-1.5 hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer"
      >
        <img
          src={logoSvg}
          alt="Producer Pal"
          className="absolute left-0 h-5 scale-200"
        />
        <h1 className="hidden md:inline text-lg font-semibold">
          Producer Pal Chat
        </h1>
      </button>

      <div className="flex gap-1 text-xs">
        {mcpStatus === "connected" && (
          <span className="text-green-600 dark:text-green-400">✓ Ready</span>
        )}
        {mcpStatus === "connecting" && (
          <span className="text-gray-500 dark:text-gray-400">
            👀 Looking for Producer Pal...
          </span>
        )}
        {mcpStatus === "error" && (
          <span className="text-red-600 dark:text-red-400">✗ Error</span>
        )}
      </div>

      <div className="ml-auto flex gap-3 items-baseline">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          <span className="hidden lg:inline">
            {getProviderName(activeProvider ?? provider)} |{" "}
          </span>
          {getModelName(activeModel ?? model)}
        </span>
        <span className="hidden lg:inline text-xs text-gray-500 dark:text-gray-400">
          {enabledToolsCount}/{totalToolsCount} tools
        </span>

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
      </div>
    </header>
  );
}
