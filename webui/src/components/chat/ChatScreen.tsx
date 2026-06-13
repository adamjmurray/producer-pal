// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import {
  AppShell,
  type ConversationPanelState,
} from "#webui/components/AppShell";
import {
  type MessageOverrides,
  type RateLimitState,
} from "#webui/hooks/chat/use-chat-types";
import { type QueuedMessage } from "#webui/hooks/chat/use-message-queue";
import { type BranchNavState } from "#webui/lib/conversation-branch-helpers";
import { type UIMessage } from "#webui/types/messages";
import { ChatStart } from "./ChatStart";
import { ChatInput } from "./controls/ChatInput";
import { type HeaderInfo } from "./controls/header/HeaderActions";
import { RateLimitIndicator } from "./controls/RateLimitIndicator";
import { ToolLimitNotice } from "./controls/ToolLimitNotice";
import { MessageList } from "./MessageList";

/**
 * Props for the main chat screen layout
 */
interface ChatScreenProps {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  rateLimitState: RateLimitState | null;
  toolLimitReached: boolean;
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  enqueueMessage: (text: string, overrides?: MessageOverrides) => void;
  queuedMessages: QueuedMessage[];
  onRemoveQueued: (id: number) => void;
  handleRetry: (messageIndex: number) => Promise<void>;
  handleEdit: (messageIndex: number, newMessage: string) => Promise<void>;
  handleCompact?: (messageIndex: number) => Promise<void>;
  onUndoCompaction?: () => void;
  canUndoCompaction?: boolean;
  headerInfo: HeaderInfo;
  activeThinking: string | null;
  defaultThinking: string;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  onOpenSettings: () => void;
  onOpenToolsSettings: () => void;
  onOpenConnectionSettings: () => void;
  onOpenContext: () => void;
  onStop: () => void;
  showTimestamps: boolean;
  showTokenUsage: boolean;
  conversationPanel: ConversationPanelState;
  branchNav?: BranchNavState;
}

/**
 * Main chat screen component
 * @param props - ChatScreenProps
 * @param props.messages - Chat messages
 * @param props.isAssistantResponding - Whether assistant is currently responding
 * @param props.rateLimitState - Rate limit retry state
 * @param props.toolLimitReached - Whether the last response hit the tool-call limit
 * @param props.handleSend - Send message handler
 * @param props.handleRetry - Retry message handler
 * @param props.handleEdit - Edit message handler
 * @param props.handleCompact - Compact-up-to-here handler
 * @param props.onUndoCompaction - Undo the last compaction
 * @param props.canUndoCompaction - Whether the last compaction can be undone
 * @param props.headerInfo - Header display state
 * @param props.activeThinking - Locked thinking level from conversation
 * @param props.defaultThinking - Default thinking level from settings
 * @param props.mcpStatus - MCP connection status
 * @param props.mcpError - MCP error message
 * @param props.checkMcpConnection - Reconnect to MCP
 * @param props.onOpenSettings - Open settings callback
 * @param props.onOpenToolsSettings - Open tools settings tab
 * @param props.onOpenConnectionSettings - Open connection settings tab
 * @param props.onStop - Stop response callback
 * @param props.showTimestamps - Whether to show message timestamps
 * @param props.conversationPanel - Conversation history panel state
 * @returns Chat screen element
 */
export function ChatScreen(props: ChatScreenProps) {
  const {
    messages,
    isAssistantResponding,
    rateLimitState,
    toolLimitReached,
    handleSend,
    enqueueMessage,
    queuedMessages,
    onRemoveQueued,
    handleRetry,
    handleEdit,
    handleCompact,
    onUndoCompaction,
    canUndoCompaction,
    headerInfo,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    onOpenSettings,
    onOpenToolsSettings,
    onOpenConnectionSettings,
    onOpenContext,
    onStop,
    showTimestamps,
    showTokenUsage,
    conversationPanel,
    branchNav,
  } = props;
  const [thinking, setThinking] = useThinkingOverride(props);

  const currentOverrides: MessageOverrides = {
    thinking,
  };

  return (
    <AppShell
      headerInfo={headerInfo}
      mcpStatus={mcpStatus}
      conversationPanel={conversationPanel}
      onOpenSettings={onOpenSettings}
      onOpenToolsSettings={onOpenToolsSettings}
      onOpenConnectionSettings={onOpenConnectionSettings}
      onOpenContext={onOpenContext}
    >
      <div className="flex-1 overflow-y-auto">
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
            queuedMessages={queuedMessages}
            onRemoveQueued={onRemoveQueued}
            isAssistantResponding={isAssistantResponding}
            handleRetry={handleRetry}
            handleEdit={handleEdit}
            handleCompact={handleCompact}
            onUndoCompaction={onUndoCompaction}
            canUndoCompaction={canUndoCompaction}
            showTimestamps={showTimestamps}
            showTokenUsage={showTokenUsage}
            requestedModel={headerInfo.activeModel}
            branchNav={branchNav}
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

      {toolLimitReached && !isAssistantResponding && (
        <ToolLimitNotice
          onContinue={() =>
            void handleSend(
              "Please continue from where you left off.",
              currentOverrides,
            )
          }
          disabled={isAssistantResponding}
        />
      )}

      <ChatInput
        handleSend={handleSend}
        onEnqueue={enqueueMessage}
        isAssistantResponding={isAssistantResponding}
        hasError={conversationHasError(messages)}
        onStop={onStop}
        thinking={thinking}
        onThinkingChange={setThinking}
      />
    </AppShell>
  );
}

/**
 * Check if the conversation is in an error state (last message is an error).
 * When true, the user must retry or edit to continue.
 * @param messages - Current UI messages
 * @returns True if the conversation ends in an error
 */
function conversationHasError(messages: UIMessage[]): boolean {
  const lastModel = messages.findLast((m) => m.role === "model");

  return lastModel?.parts.some((p) => p.type === "error") ?? false;
}

/**
 * Per-conversation thinking override. Settings changes apply immediately,
 * while conversation switches restore the locked level.
 * @param props - Props with activeThinking and defaultThinking
 * @returns [thinking, setThinking] state tuple
 */
function useThinkingOverride(
  props: Pick<ChatScreenProps, "activeThinking" | "defaultThinking">,
): [string, (v: string) => void] {
  const { activeThinking, defaultThinking } = props;
  const [thinking, setThinking] = useState(activeThinking ?? defaultThinking);

  useEffect(() => {
    setThinking(defaultThinking);
  }, [defaultThinking]);

  // Restore locked level for existing conversations, reset to default for new.
  // defaultThinking is excluded from deps: it has its own sync effect above.
  useEffect(
    () => setThinking(activeThinking ?? defaultThinking),
    [activeThinking], // eslint-disable-line react-hooks/exhaustive-deps -- defaultThinking synced separately
  );

  return [thinking, setThinking];
}
