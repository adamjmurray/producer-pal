// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "preact/hooks";
import { type ModeContext } from "#webui/components/mode-context";
import { chatAdapter } from "#webui/hooks/chat/adapter";
import { useChatModeReporting } from "#webui/hooks/chat/helpers/use-chat-mode-reporting";
import { useConversationHandlers } from "#webui/hooks/chat/helpers/use-conversation-handlers";
import { useConversationLock } from "#webui/hooks/chat/helpers/use-conversation-lock";
import { useConversationPanelState } from "#webui/hooks/chat/helpers/use-conversation-panel-state";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import {
  type McpStatus,
  type McpTool,
} from "#webui/hooks/connection/use-mcp-connection";
import { type UseRemoteConfigReturn } from "#webui/hooks/connection/use-remote-config";
import { useSyncSmallModelMode } from "#webui/hooks/connection/use-sync-small-model-mode";
import { useClearViewingModeOnReset } from "#webui/hooks/use-clear-viewing-mode-on-reset";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { type ViewState } from "#webui/hooks/use-view-state";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import { type UseSettingsReturn } from "#webui/types/settings";
import { getBaseUrl, LOCAL_PROVIDER_API_KEY } from "#webui/utils/provider-url";

export interface UseChatModeStateParams {
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
  onForeignRecord: (record: ConversationRecord) => void;
  clearViewingMode: () => void;
  setModeContext: (ctx: ModeContext) => void;
}

/**
 * Composes the chat-mode hook graph (chat, conversation manager, transfer,
 * panel state) and reports the active session's lock + delete handlers up to
 * App via setModeContext. Pulled out of ChatApp purely so ChatApp's main
 * function stays under the size limit.
 *
 * @param params - Chat-mode hook inputs
 * @returns Chat state + handlers ready for ChatScreen
 */
export function useChatModeState(params: UseChatModeStateParams) {
  const {
    settings,
    display,
    viewState,
    setViewState,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    remoteConfig,
    totalToolsCount,
    enabledToolsCount,
    onForeignRecord,
    clearViewingMode,
    setModeContext,
  } = params;

  const baseUrl = getBaseUrl(settings.provider, settings.baseUrl);
  const autoSaveRef = useRef<(() => void) | null>(null);
  const resolvedApiKey =
    settings.provider === "lmstudio" || settings.provider === "ollama"
      ? settings.apiKey || LOCAL_PROVIDER_API_KEY
      : settings.apiKey;

  const aiSdkChat = useChat({
    provider: settings.provider,
    apiKey: resolvedApiKey,
    model: settings.model,
    thinking: settings.thinking,
    temperature: settings.temperature,
    enabledTools: settings.enabledTools,
    smallModelMode: settings.smallModelMode,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    adapter: chatAdapter,
    extraParams: {
      baseUrl,
      showThoughts: settings.showThoughts,
      provider: settings.provider,
      apiKey: resolvedApiKey,
    },
    autoSaveRef,
  });

  const { chat, wrappedHandleSend, wrappedClearConversation } =
    useConversationLock({ chat: aiSdkChat });

  useSyncSmallModelMode(
    remoteConfig.serverSmallModelMode,
    chat.activeSmallModelMode,
    settings.setSmallModelMode,
    remoteConfig.postSmallModelMode,
  );

  const conversationManager = useConversations({
    getChatHistory: chat.getChatHistory,
    restoreChatHistory: chat.restoreChatHistory,
    clearConversation: wrappedClearConversation,
    activeModel: chat.activeModel,
    activeProvider: chat.activeProvider,
    activeThinking: chat.activeThinking,
    activeTemperature: chat.activeTemperature,
    activeShowThoughts: chat.activeShowThoughts,
    activeSmallModelMode: chat.activeSmallModelMode,
    onForeignRecord,
  });

  useEffect(() => {
    /* v8 ignore start -- auto-save ref: only invoked during streaming */
    autoSaveRef.current = () =>
      void conversationManager.saveCurrentConversation(Date.now());
    /* v8 ignore stop */
  }, [conversationManager]);

  useClearViewingModeOnReset(
    conversationManager.activeConversationId,
    clearViewingMode,
  );

  const transfer = useConversationTransfer(conversationManager.refreshList);
  const conversationHandlers = useConversationHandlers(
    conversationManager,
    chat.stopResponse,
    clearViewingMode,
  );

  const conversationPanelState = useConversationPanelState({
    conversationManager,
    transfer,
    viewState,
    setViewState,
    handlers: conversationHandlers,
  });

  const prevRespondingRef = useRef(false);

  useEffect(() => {
    if (!chat.isAssistantResponding && prevRespondingRef.current) {
      void conversationManager.saveCurrentConversation(Date.now());
    }

    prevRespondingRef.current = chat.isAssistantResponding;
  }, [chat.isAssistantResponding, conversationManager]);

  const headerInfo = useChatModeReporting({
    chat,
    settings,
    display,
    enabledToolsCount,
    totalToolsCount,
    handleDeleteAll: conversationHandlers.handleDeleteAll,
    handleDeleteUnbookmarked: conversationHandlers.handleDeleteUnbookmarked,
    setModeContext,
  });

  return { chat, wrappedHandleSend, conversationPanelState, headerInfo };
}
