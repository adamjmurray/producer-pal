import { ChatHeader } from "./ChatHeader.jsx";
import { ChatInput } from "./ChatInput.jsx";
import { ChatStart } from "./ChatStart.jsx";
import { MessageList } from "./MessageList.jsx";

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

      <div class="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <ChatStart
            mcpStatus={mcpStatus}
            mcpError={mcpError}
            checkMcpConnection={checkMcpConnection}
            handleSend={handleSend}
          />
        ) : (
          <MessageList
            messages={messages}
            isAssistantResponding={isAssistantResponding}
          />
        )}
      </div>

      <ChatInput
        handleSend={handleSend}
        isAssistantResponding={isAssistantResponding}
      />
    </div>
  );
}
