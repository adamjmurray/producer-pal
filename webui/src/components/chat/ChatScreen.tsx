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
  onStop: () => void;
}

/**
 *
 * @param root0
 * @param root0.messages
 * @param root0.isAssistantResponding
 * @param root0.handleSend
 * @param root0.handleRetry
 * @param root0.activeModel
 * @param root0.activeThinking
 * @param root0.activeTemperature
 * @param root0.activeProvider
 * @param root0.mcpStatus
 * @param root0.mcpError
 * @param root0.checkMcpConnection
 * @param root0.onOpenSettings
 * @param root0.onClearConversation
 * @param root0.onStop
 */
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
  onStop,
}: ChatScreenProps) {
  return (
    <div className="flex flex-col h-screen">
      <ChatHeader
        mcpStatus={mcpStatus}
        activeModel={activeModel}
        activeThinking={activeThinking}
        activeTemperature={activeTemperature}
        activeProvider={activeProvider}
        hasMessages={messages.length > 0}
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
        onStop={onStop}
      />
    </div>
  );
}
