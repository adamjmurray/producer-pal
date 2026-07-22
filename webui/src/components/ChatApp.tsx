// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { ChatScreen } from "#webui/components/chat/ChatScreen";
import { type ModeAppProps } from "#webui/components/mode-context";
import { useChatModeState } from "#webui/hooks/chat/use-chat-mode-state";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { type UseRemoteConfigReturn } from "#webui/hooks/connection/use-remote-config";

interface ChatAppProps extends ModeAppProps {
  mcpError: string | null;
  mcpTools?: McpTool[] | null;
  checkMcpConnection: () => Promise<void>;
  remoteConfig: UseRemoteConfigReturn;
}

/**
 * Chat mode: text-based chat UI (any AI SDK provider). The chat-specific hook
 * graph (useChat, conversations, transfer, etc.) lives in `useChatModeState`;
 * this component is just the JSX shell that hands the result to ChatScreen.
 *
 * @param props - ChatAppProps
 * @returns Chat screen wrapped in AppShell (via ChatScreen)
 */
export function ChatApp(props: ChatAppProps) {
  const {
    settings,
    display,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    onOpenSettings,
    onOpenToolsSettings,
    onOpenConnectionSettings,
    onOpenContext,
  } = props;

  const {
    chat,
    wrappedHandleSend,
    conversationPanelState,
    headerInfo,
    branchNav,
    systemInstruction,
  } = useChatModeState(props);

  return (
    <ChatScreen
      messages={chat.messages}
      isAssistantResponding={chat.isAssistantResponding || chat.isCompacting}
      isCompacting={chat.isCompacting}
      rateLimitState={chat.rateLimitState}
      toolLimitReached={chat.toolLimitReached}
      handleSend={wrappedHandleSend}
      enqueueMessage={chat.enqueueMessage}
      queuedMessages={chat.queuedMessages}
      onRemoveQueued={chat.removeMessage}
      handleRetry={chat.handleRetry}
      handleEdit={chat.handleEdit}
      handleCompact={chat.compact}
      onUndoCompaction={chat.undoCompaction}
      canUndoCompaction={chat.canUndoCompaction}
      headerInfo={headerInfo}
      activeThinking={chat.activeThinking}
      defaultThinking={settings.thinking}
      mcpStatus={mcpStatus}
      mcpError={mcpError}
      checkMcpConnection={checkMcpConnection}
      onOpenSettings={onOpenSettings}
      onOpenToolsSettings={onOpenToolsSettings}
      onOpenConnectionSettings={onOpenConnectionSettings}
      onOpenContext={onOpenContext}
      onStop={chat.stopResponse}
      showTimestamps={display.showTimestamps}
      showTokenUsage={display.showTokenUsage}
      conversationPanel={conversationPanelState}
      branchNav={branchNav}
      systemInstruction={systemInstruction}
    />
  );
}
