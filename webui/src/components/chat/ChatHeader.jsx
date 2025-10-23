import logoSvg from "../../assets/producer-pal-logo.svg";
import { getModelName } from "../../config.js";

export function ChatHeader({
  mcpStatus,
  activeModel,
  activeThinking,
  activeTemperature,
  theme,
  setTheme,
  onOpenSettings,
}) {
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
      <div className="ml-auto flex gap-3 items-baseline">
        {activeModel && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {getModelName(activeModel)}
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
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          className="text-xs bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </header>
  );
}
