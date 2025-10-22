import { useEffect, useRef, useState } from "preact/hooks";
import { getModelName } from "../config.js";
import { AssistantMessage } from "./AssistantMessage.jsx";
import { ChatStart } from "./ChatStart.jsx";

export function ChatScreen({
  messages,
  isLoading,
  handleSend,
  activeModel,
  activeThinking,
  activeTemperature,
  mcpStatus,
  mcpError,
  checkMcpConnection,
  theme,
  setTheme,
  onOpenSettings,
}) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
      setInput("");
    }
  };

  const handleSendClick = () => {
    handleSend(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-baseline">
        <h1 className="text-lg font-semibold">Producer Pal Chat</h1>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <ChatStart
            mcpStatus={mcpStatus}
            mcpError={mcpError}
            checkMcpConnection={checkMcpConnection}
            handleSend={handleSend}
          />
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`${
              msg.role === "user"
                ? "ml-auto text-black bg-blue-300 dark:text-white dark:bg-blue-600"
                : msg.role === "error"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800"
            } rounded-lg py-0.5 px-3 max-w-[90%]`}
          >
            {msg.role === "assistant" && <AssistantMessage parts={msg.parts} />}

            {msg.role === "user" && (
              <div className="prose dark:prose-invert prose-sm">
                {msg.content}
              </div>
            )}
            {msg.role === "error" && (
              <div className="prose dark:prose-invert prose-sm">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-300 dark:border-gray-700 p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onInput={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Type a message... (Shift+Enter for new line)"
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded resize-none placeholder:dark:text-gray-400 placeholder:text-gray-500"
            rows="2"
          />
          <button
            onClick={handleSendClick}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
