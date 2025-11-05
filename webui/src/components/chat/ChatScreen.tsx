import { ChatHeader } from "./ChatHeader.jsx";
import { ChatInput } from "./ChatInput.jsx";
import { ChatStart } from "./ChatStart.jsx";
import { MessageList } from "./MessageList.jsx";
import type { UIMessage } from "../../types/messages.js";
import type { Provider } from "../../types/settings.js";

interface ChatScreenProps {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  handleSend: (message: string) => Promise<void>;
  handleRetry: (messageIndex: number) => Promise<void>;
  activeModel: string | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  activeProvider: Provider | null;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  onOpenSettings: () => void;
  onClearConversation: () => void;
}

export function ChatScreen({
  messages,
  isAssistantResponding,
  handleSend,
  handleRetry,
  activeModel,
  activeThinking,
  activeTemperature,
  activeProvider,
  mcpStatus,
  mcpError,
  checkMcpConnection,
  onOpenSettings,
  onClearConversation,
}: ChatScreenProps) {
  return (
    <div className="flex flex-col h-screen">
      <ChatHeader
        mcpStatus={mcpStatus}
        activeModel={activeModel}
        activeThinking={activeThinking}
        activeTemperature={activeTemperature}
        activeProvider={activeProvider}
        onOpenSettings={onOpenSettings}
        onClearConversation={onClearConversation}
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
            handleRetry={handleRetry}
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
