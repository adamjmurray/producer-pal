// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "preact/hooks";
import type {
  MessageOverrides,
  RateLimitState,
} from "#webui/hooks/chat/use-chat";
import type { UIMessage } from "#webui/types/messages";
import type { Provider } from "#webui/types/settings";
import { ChatStart } from "./ChatStart";
import { ChatHeader } from "./controls/ChatHeader";
import { ChatInput } from "./controls/ChatInput";
import { RateLimitIndicator } from "./controls/RateLimitIndicator";
import { MessageList } from "./MessageList";

/**
 * Props for the main chat screen layout
 */
interface ChatScreenProps {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  rateLimitState: RateLimitState | null;
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  handleRetry: (messageIndex: number) => Promise<void>;
  activeModel: string | null;
  activeProvider: Provider | null;
  provider: Provider;
  model: string;
  defaultThinking: string;
  defaultTemperature: number;
  defaultShowThoughts: boolean;
  enabledToolsCount: number;
  totalToolsCount: number;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  onOpenSettings: () => void;
  onClearConversation: () => void;
  onStop: () => void;
}

/**
 * Main chat screen component
 * @param {ChatScreenProps} props - Component props
 * @param {UIMessage[]} props.messages - Chat messages
 * @param {boolean} props.isAssistantResponding - Whether assistant is responding
 * @param {RateLimitState | null} props.rateLimitState - Rate limit retry state
 * @param {(message: string) => Promise<void>} props.handleSend - Send message callback
 * @param {(messageIndex: number) => Promise<void>} props.handleRetry - Retry message callback
 * @param {string | null} props.activeModel - Active model identifier
 * @param {Provider | null} props.activeProvider - Active provider
 * @param {Provider} props.provider - Provider from settings
 * @param {string} props.model - Model from settings
 * @param {string} props.defaultThinking - Default thinking mode from settings
 * @param {number} props.defaultTemperature - Default temperature from settings
 * @param {boolean} props.defaultShowThoughts - Default showThoughts from settings
 * @param {number} props.enabledToolsCount - Number of enabled tools
 * @param {number} props.totalToolsCount - Total number of available tools
 * @param {"connected" | "connecting" | "error"} props.mcpStatus - MCP connection status
 * @param {string | null} props.mcpError - MCP error message
 * @param {() => Promise<void>} props.checkMcpConnection - Check MCP connection callback
 * @param {() => void} props.onOpenSettings - Open settings callback
 * @param {() => void} props.onClearConversation - Clear conversation callback
 * @param {() => void} props.onStop - Stop response callback
 * @returns {JSX.Element} - React component
 */
export function ChatScreen({
  messages,
  isAssistantResponding,
  rateLimitState,
  handleSend,
  handleRetry,

  activeModel,
  activeProvider,
  provider,
  model,
  defaultThinking,
  defaultTemperature,
  defaultShowThoughts,
  enabledToolsCount,
  totalToolsCount,
  mcpStatus,
  mcpError,
  checkMcpConnection,

  onOpenSettings,
  onClearConversation,
  onStop,
}: ChatScreenProps) {
  // Per-message override state (lifted from ChatInput so ChatStart can also use it)
  const [thinking, setThinking] = useState(defaultThinking);
  const [temperature, setTemperature] = useState(defaultTemperature);
  const [showThoughts, setShowThoughts] = useState(defaultShowThoughts);

  const handleResetToDefaults = () => {
    setThinking(defaultThinking);
    setTemperature(defaultTemperature);
    setShowThoughts(defaultShowThoughts);
  };

  const currentOverrides: MessageOverrides = {
    thinking,
    temperature,
    showThoughts,
  };

  return (
    <div className="flex flex-col h-screen">
      <ChatHeader
        mcpStatus={mcpStatus}
        activeModel={activeModel}
        activeProvider={activeProvider}
        model={model}
        provider={provider}
        enabledToolsCount={enabledToolsCount}
        totalToolsCount={totalToolsCount}
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
            overrides={currentOverrides}
          />
        ) : (
          <MessageList
            messages={messages}
            isAssistantResponding={isAssistantResponding}
            handleRetry={handleRetry}
          />
        )}
      </div>

      {rateLimitState?.isRetrying && (
        <RateLimitIndicator
          retryAttempt={rateLimitState.attempt}
          maxAttempts={rateLimitState.maxAttempts}
          retryDelayMs={rateLimitState.delayMs}
          onCancel={onStop}
        />
      )}

      <ChatInput
        handleSend={handleSend}
        isAssistantResponding={isAssistantResponding}
        onStop={onStop}
        provider={provider}
        model={model}
        defaultThinking={defaultThinking}
        defaultTemperature={defaultTemperature}
        defaultShowThoughts={defaultShowThoughts}
        thinking={thinking}
        temperature={temperature}
        showThoughts={showThoughts}
        onThinkingChange={setThinking}
        onTemperatureChange={setTemperature}
        onShowThoughtsChange={setShowThoughts}
        onResetToDefaults={handleResetToDefaults}
      />
    </div>
  );
}
