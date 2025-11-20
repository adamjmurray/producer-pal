import logoSvg from "../../assets/producer-pal-logo.svg";
import { getModelName } from "../../config.js";
import type { Provider } from "../../types/settings.js";

interface ChatHeaderProps {
  mcpStatus: "connected" | "connecting" | "error";
  activeModel: string | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  activeProvider: Provider | null;
  hasMessages: boolean;
  onOpenSettings: () => void;
  onClearConversation: () => void;
}

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
 *
 * @param root0
 * @param root0.mcpStatus
 * @param root0.activeModel
 * @param root0.activeThinking
 * @param root0.activeTemperature
 * @param root0.activeProvider
 * @param root0.hasMessages
 * @param root0.onOpenSettings
 * @param root0.onClearConversation
 */
export function ChatHeader({
  mcpStatus,
  activeModel,
  activeThinking,
  activeTemperature,
  activeProvider,
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
        {activeModel && activeProvider && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {getProviderName(activeProvider)} | {getModelName(activeModel)}
          </span>
        )}
        {activeThinking && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Thinking: {activeThinking}
          </span>
        )}
        {activeTemperature != null && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {Math.round((activeTemperature / 2) * 100)}% random
          </span>
        )}
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
