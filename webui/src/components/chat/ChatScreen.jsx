import { useEffect, useRef } from "preact/hooks";
import { ActivityIndicator } from "./ActivityIndicator.jsx";
import { AssistantMessage } from "./AssistantMessage.jsx";
import { ChatHeader } from "./ChatHeader.jsx";
import { ChatInput } from "./ChatInput.jsx";
import { ChatStart } from "./ChatStart.jsx";

export function ChatScreen({
  messages,
  isAssistantResponding,
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
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen">
      <ChatHeader
        mcpStatus={mcpStatus}
        activeModel={activeModel}
        activeThinking={activeThinking}
        activeTemperature={activeTemperature}
        theme={theme}
        setTheme={setTheme}
        onOpenSettings={onOpenSettings}
      />

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

        {isAssistantResponding && <ActivityIndicator />}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        handleSend={handleSend}
        isAssistantResponding={isAssistantResponding}
      />
    </div>
  );
}
