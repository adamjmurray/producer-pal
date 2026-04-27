// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import { type QueuedMessage } from "#webui/hooks/chat/helpers/use-message-queue";
import {
  type MessageOverrides,
  type RateLimitState,
} from "#webui/hooks/chat/use-chat-types";
import { useUpdateCheck } from "#webui/hooks/use-update-check";
import { type UIMessage } from "#webui/types/messages";
import { ChatStart } from "./ChatStart";
import { ChatHeader } from "./controls/ChatHeader";
import { ChatInput } from "./controls/ChatInput";
import { type HeaderInfo } from "./controls/header/HeaderActions";
import { RateLimitIndicator } from "./controls/RateLimitIndicator";
import {
  ConversationPanel,
  type ConversationPanelProps,
} from "./ConversationPanel";
import { MessageList } from "./MessageList";

/**
 * Props for the main chat screen layout
 */
interface ChatScreenProps {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  rateLimitState: RateLimitState | null;
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  enqueueMessage: (text: string, overrides?: MessageOverrides) => void;
  queuedMessages: QueuedMessage[];
  onRemoveQueued: (id: number) => void;
  handleRetry: (messageIndex: number) => Promise<void>;
  handleEdit: (messageIndex: number, newMessage: string) => Promise<void>;
  headerInfo: HeaderInfo;
  activeThinking: string | null;
  defaultThinking: string;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  onOpenSettings: () => void;
  onOpenToolsSettings: () => void;
  onOpenConnectionSettings: () => void;
  onStop: () => void;
  showTimestamps: boolean;
  showTokenUsage: boolean;
  conversationPanel: ConversationPanelState;
}

/** State and handlers for the conversation history panel.
 * Extends ConversationPanelProps with renamed callbacks and panel toggle state. */
export interface ConversationPanelState extends Omit<
  ConversationPanelProps,
  "onNewConversation"
> {
  onToggle: () => void;
  onNew: () => void;
}

/**
 * Main chat screen component
 * @param props - ChatScreenProps
 * @param props.messages - Chat messages
 * @param props.isAssistantResponding - Whether assistant is currently responding
 * @param props.rateLimitState - Rate limit retry state
 * @param props.handleSend - Send message handler
 * @param props.handleRetry - Retry message handler
 * @param props.handleEdit - Edit message handler
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
    handleSend,
    enqueueMessage,
    queuedMessages,
    onRemoveQueued,
    handleRetry,
    handleEdit,
    headerInfo,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    onOpenSettings,
    onOpenToolsSettings,
    onOpenConnectionSettings,
    onStop,
    showTimestamps,
    showTokenUsage,
    conversationPanel,
  } = props;
  const latestVersion = useUpdateCheck();
  const [thinking, setThinking] = useThinkingOverride(props);

  return (
    <div className="flex flex-col h-screen bg-zinc-100 dark:bg-zinc-950">
      <ChatHeader
        headerInfo={headerInfo}
        mcpStatus={mcpStatus}
        isHistoryOpen={conversationPanel.isOpen}
        isActiveBookmarked={
          findActiveConversation(conversationPanel)?.bookmarked
        }
        latestVersion={latestVersion}
        onOpenSettings={onOpenSettings}
        onOpenToolsSettings={onOpenToolsSettings}
        onOpenConnectionSettings={onOpenConnectionSettings}
        onToggleHistory={conversationPanel.onToggle}
        onNewConversation={conversationPanel.onNew}
        onToggleBookmark={
          conversationPanel.activeConversationId
            ? () =>
                conversationPanel.onToggleBookmark(
                  conversationPanel.activeConversationId as string,
                )
            : undefined
        }
      />

      <div className="flex flex-1 min-h-0 justify-center">
        <ConversationPanel
          isOpen={conversationPanel.isOpen}
          conversations={conversationPanel.conversations}
          activeConversationId={conversationPanel.activeConversationId}
          onSelect={conversationPanel.onSelect}
          onNewConversation={conversationPanel.onNew}
          onDelete={conversationPanel.onDelete}
          onExportItem={conversationPanel.onExportItem}
          onRename={conversationPanel.onRename}
          onToggleBookmark={conversationPanel.onToggleBookmark}
          onExport={conversationPanel.onExport}
          onImport={conversationPanel.onImport}
          notification={conversationPanel.notification}
          onDismissNotification={conversationPanel.onDismissNotification}
        />

        <div
          className={`flex flex-col flex-9999 min-w-0 max-w-5xl ${conversationPanel.isOpen ? "hidden sm:flex" : ""}`}
        >
          <div className="flex flex-col flex-1 min-h-0 w-full border-x border-zinc-300 dark:border-zinc-700 shadow-lg dark:shadow-black/40 bg-white dark:bg-zinc-900">
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <ChatStart
                  mcpStatus={mcpStatus}
                  mcpError={mcpError}
                  checkMcpConnection={checkMcpConnection}
                  handleSend={handleSend}
                  overrides={{ thinking }}
                />
              ) : (
                <MessageList
                  messages={messages}
                  queuedMessages={queuedMessages}
                  onRemoveQueued={onRemoveQueued}
                  isAssistantResponding={isAssistantResponding}
                  handleRetry={handleRetry}
                  handleEdit={handleEdit}
                  showTimestamps={showTimestamps}
                  showTokenUsage={showTokenUsage}
                  requestedModel={headerInfo.activeModel}
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
              onEnqueue={enqueueMessage}
              isAssistantResponding={isAssistantResponding}
              hasError={conversationHasError(messages)}
              onStop={onStop}
              thinking={thinking}
              onThinkingChange={setThinking}
            />
          </div>
        </div>
      </div>
    </div>
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

/**
 * Find the active conversation from the panel state.
 * @param panel - Conversation panel state
 * @returns Active conversation or undefined
 */
function findActiveConversation(panel: ConversationPanelState) {
  if (!panel.activeConversationId) return;

  return panel.conversations.find((c) => c.id === panel.activeConversationId);
}
