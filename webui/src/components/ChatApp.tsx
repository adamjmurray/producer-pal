// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { ChatScreen } from "#webui/components/chat/ChatScreen";
import { type ModeContext } from "#webui/components/mode-context";
import { useChatModeState } from "#webui/hooks/chat/use-chat-mode-state";
import {
  type McpStatus,
  type McpTool,
} from "#webui/hooks/connection/use-mcp-connection";
import { type UseRemoteConfigReturn } from "#webui/hooks/connection/use-remote-config";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { type ViewState } from "#webui/hooks/view-state/use-view-state";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import { type UseSettingsReturn } from "#webui/types/settings";

interface ChatAppProps {
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  viewState: ViewState;
  setViewState: (partial: Partial<ViewState>) => void;
  mcpStatus: McpStatus;
  mcpError: string | null;
  mcpTools?: McpTool[] | null;
  checkMcpConnection: () => Promise<void>;
  remoteConfig: UseRemoteConfigReturn;
  totalToolsCount: number;
  enabledToolsCount: number;
  onOpenSettings: () => void;
  onOpenToolsSettings: () => void;
  onOpenConnectionSettings: () => void;
  onForeignRecord: (record: ConversationRecord) => void;
  clearViewingMode: () => void;
  setModeContext: (ctx: ModeContext) => void;
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
  } = props;

  const { chat, wrappedHandleSend, conversationPanelState, headerInfo } =
    useChatModeState(props);

  return (
    <ChatScreen
      messages={chat.messages}
      isAssistantResponding={chat.isAssistantResponding}
      rateLimitState={chat.rateLimitState}
      toolLimitReached={chat.toolLimitReached}
      handleSend={wrappedHandleSend}
      handleRetry={chat.handleRetry}
      handleEdit={chat.handleEdit}
      headerInfo={headerInfo}
      activeThinking={chat.activeThinking}
      defaultThinking={settings.thinking}
      mcpStatus={mcpStatus}
      mcpError={mcpError}
      checkMcpConnection={checkMcpConnection}
      onOpenSettings={onOpenSettings}
      onOpenToolsSettings={onOpenToolsSettings}
      onOpenConnectionSettings={onOpenConnectionSettings}
      onStop={chat.stopResponse}
      showTimestamps={display.showTimestamps}
      showTokenUsage={display.showTokenUsage}
      conversationPanel={conversationPanelState}
    />
  );
}
