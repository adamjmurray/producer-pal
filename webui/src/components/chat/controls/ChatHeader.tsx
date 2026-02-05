// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import logoSvg from "#webui/assets/producer-pal-logo.svg";
import { getModelName } from "#webui/lib/config";
import type { Provider } from "#webui/types/settings";

interface ChatHeaderProps {
  mcpStatus: "connected" | "connecting" | "error";
  activeModel: string | null;
  activeProvider: Provider | null;
  model: string;
  provider: Provider;
  enabledToolsCount: number;
  totalToolsCount: number;
  hasMessages: boolean;
  onOpenSettings: () => void;
  onClearConversation: () => void;
}

/**
 * Gets display name for provider
 * @param {Provider} provider - Provider identifier
 * @returns {JSX.Element} - React component
 */
function getProviderName(provider: Provider): string {
  switch (provider) {
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
 * @param {boolean} props.hasMessages - Whether conversation has messages
 * @param {() => void} props.onOpenSettings - Callback to open settings
 * @param {() => void} props.onClearConversation - Callback to clear conversation
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
  hasMessages,
  onOpenSettings,
  onClearConversation,
}: ChatHeaderProps) {
  const handleRestart = () => {
    if (window.confirm("Clear all messages and restart conversation?")) {
      onClearConversation();
    }
  };

  return (
    <header className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-baseline">
      <img
        src={logoSvg}
        alt="Producer Pal"
        className="absolute h-5 translate-y-1 scale-200"
      />
      <h1 className="pl-9 text-lg font-semibold">Producer Pal Chat</h1>
      <div className="ml-2 flex gap-1 text-xs">
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

      {hasMessages && <div className="flex-1" />}
      {hasMessages && (
        <button
          onClick={handleRestart}
          className="text-xs px-2 py-1 border border-red-500 text-red-500 bg-transparent hover:bg-red-500 hover:text-white rounded transition-colors"
        >
          Restart
        </button>
      )}
      {hasMessages && <div className="flex-1" />}

      <div
        className={
          hasMessages
            ? "flex gap-3 items-baseline"
            : "ml-auto flex gap-3 items-baseline"
        }
      >
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {getProviderName(activeProvider ?? provider)} |{" "}
          {getModelName(activeModel ?? model)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {enabledToolsCount}/{totalToolsCount} tools
        </span>
        <button
          onClick={onOpenSettings}
          className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Settings
        </button>
      </div>
    </header>
  );
}
