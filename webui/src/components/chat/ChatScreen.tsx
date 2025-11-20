import type { UIMessage } from "../../types/messages";
import type { Provider } from "../../types/settings";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { ChatStart } from "./ChatStart";
import { MessageList } from "./MessageList";

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
 * Main chat screen component
 * @param {ChatScreenProps} root0 - Component props
 * @param {UIMessage[]} root0.messages - Chat messages
 * @param {boolean} root0.isAssistantResponding - Whether assistant is responding
 * @param {(message: string) => Promise<void>} root0.handleSend - Send message callback
 * @param {(messageIndex: number) => Promise<void>} root0.handleRetry - Retry message callback
 * @param {string | null} root0.activeModel - Active model identifier
 * @param {string | null} root0.activeThinking - Active thinking mode
 * @param {number | null} root0.activeTemperature - Active temperature setting
 * @param {Provider | null} root0.activeProvider - Active provider
 * @param {"connected" | "connecting" | "error"} root0.mcpStatus - MCP connection status
 * @param {string | null} root0.mcpError - MCP error message
 * @param {() => Promise<void>} root0.checkMcpConnection - Check MCP connection callback
 * @param {() => void} root0.onOpenSettings - Open settings callback
 * @param {() => void} root0.onClearConversation - Clear conversation callback
 * @param {() => void} root0.onStop - Stop response callback
 * @returns {JSX.Element} - React component
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
