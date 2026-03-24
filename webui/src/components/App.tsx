// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { chatAdapter } from "#webui/hooks/chat/adapter";
import { useConversationHandlers } from "#webui/hooks/chat/helpers/use-conversation-handlers";
import { useConversationLock } from "#webui/hooks/chat/helpers/use-conversation-lock";
import { useConversationPanelState } from "#webui/hooks/chat/helpers/use-conversation-panel-state";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import { ToolNamesContext } from "#webui/hooks/connection/tool-names-context";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { useSyncSmallModelMode } from "#webui/hooks/connection/use-sync-small-model-mode";
import { useHasUnsavedChanges } from "#webui/hooks/settings/use-has-unsaved-changes";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useSettingsClose } from "#webui/hooks/settings/use-settings-close";
import { useSettingsDismiss } from "#webui/hooks/settings/use-settings-dismiss";
import { useTheme } from "#webui/hooks/theme/use-theme";
import {
  usePreferencesSettings,
  savePreferencesSettings,
} from "#webui/hooks/use-preferences-settings";
import { useViewState } from "#webui/hooks/use-view-state";
import { getBaseUrl, LOCAL_PROVIDER_API_KEY } from "#webui/utils/provider-url";
import { ChatScreen } from "./chat/ChatScreen";
import { SettingsScreen } from "./settings/SettingsScreen";
import { type TabId } from "./settings/SettingsTabs";

/**
 * @returns {JSX.Element} - React component
 */
export function App() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const { viewState, setViewState } = useViewState();
  const openSettings = (settingsTab?: TabId) =>
    setViewState(
      settingsTab
        ? { settingsOpen: true, settingsTab }
        : { settingsOpen: true },
    );
  const display = usePreferencesSettings();
  const { mcpStatus, mcpError, mcpTools, checkMcpConnection } =
    useMcpConnection();
  const toolNamesMap = useMemo(
    () => Object.fromEntries(mcpTools?.map((t) => [t.id, t.name]) ?? []),
    [mcpTools],
  );
  const { serverSmallModelMode, postSmallModelMode } =
    useRemoteConfig(mcpStatus);
  const baseUrl = getBaseUrl(settings.provider, settings.baseUrl);

  const autoSaveRef = useRef<(() => void) | null>(null);

  const aiSdkChat = useChat({
    provider: settings.provider,
    apiKey:
      settings.provider === "lmstudio" || settings.provider === "ollama"
        ? settings.apiKey || LOCAL_PROVIDER_API_KEY
        : settings.apiKey,
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
      apiKey:
        settings.provider === "lmstudio" || settings.provider === "ollama"
          ? settings.apiKey || LOCAL_PROVIDER_API_KEY
          : settings.apiKey,
    },
    autoSaveRef,
  });

  const { chat, wrappedHandleSend, wrappedClearConversation } =
    useConversationLock({ chat: aiSdkChat });

  // Sync smallModelMode: seed from server when no active lock, post to server when lock changes
  useSyncSmallModelMode(
    serverSmallModelMode,
    chat.activeSmallModelMode,
    settings.setSmallModelMode,
    postSmallModelMode,
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
  });

  // Auto-save on user message sent (called from useChat on first stream yield)
  useEffect(() => {
    /* v8 ignore start -- auto-save ref: only invoked during streaming */
    autoSaveRef.current = () =>
      void conversationManager.saveCurrentConversation(Date.now());
    /* v8 ignore stop */
  }, [conversationManager]);

  const transfer = useConversationTransfer(conversationManager.refreshList);
  const conversationHandlers = useConversationHandlers(
    conversationManager,
    chat.stopResponse,
  );
  const { handleDeleteAll, handleDeleteUnbookmarked } = conversationHandlers;

  const conversationPanelState = useConversationPanelState({
    conversationManager,
    transfer,
    viewState,
    setViewState,
    handlers: conversationHandlers,
  });

  // Auto-save when streaming completes — covers tool results and follow-up
  // text merged into existing UIMessages
  const prevRespondingRef = useRef(false);

  useEffect(() => {
    if (!chat.isAssistantResponding && prevRespondingRef.current) {
      void conversationManager.saveCurrentConversation(Date.now());
    }

    prevRespondingRef.current = chat.isAssistantResponding;
  }, [chat.isAssistantResponding, conversationManager]);

  const totalToolsCount = mcpTools?.length ?? 0;
  const enabledToolsCount = mcpTools
    ? mcpTools.filter((t) => settings.enabledTools[t.id] !== false).length
    : 0;

  const showSettings = viewState.settingsOpen || !settings.settingsConfigured;
  const { settingsClosing, closeSettings } = useSettingsClose(setViewState);

  // Track original appearance settings when settings opened (for cancel)
  const originalThemeRef = useRef(theme);
  const originalDisplayRef = useRef(display);
  const prevShowSettingsRef = useRef(showSettings);

  // Save originals only when settings transitions from closed to open
  useEffect(() => {
    if (showSettings && !prevShowSettingsRef.current) {
      originalThemeRef.current = theme;
      originalDisplayRef.current = { ...display };
    }

    prevShowSettingsRef.current = showSettings;
  }, [showSettings, theme, display]);

  const appearance = {
    theme,
    showTimestamps: display.showTimestamps,
    showHelpLinks: display.showHelpLinks,
    showTokenUsage: display.showTokenUsage,
  };
  const hasUnsavedChanges = useHasUnsavedChanges(
    settings,
    appearance,
    showSettings,
  );

  const handleSaveSettings = () => {
    closeSettings(() => {
      settings.saveSettings();
      postSmallModelMode(settings.smallModelMode);
      savePreferencesSettings(display);
    });
  };

  const handleCancelSettings = useCallback(() => {
    closeSettings(() => {
      settings.cancelSettings();
      setTheme(originalThemeRef.current);
      const orig = originalDisplayRef.current;

      display.setShowTimestamps(orig.showTimestamps);
      display.setShowHelpLinks(orig.showHelpLinks);
      display.setShowTokenUsage(orig.showTokenUsage);
    });
  }, [closeSettings, settings, setTheme, display]);

  const { shake, clearShake, handleSettingsDismiss } = useSettingsDismiss({
    showSettings,
    settingsConfigured: settings.settingsConfigured,
    settingsClosing,
    hasUnsavedChanges,
    handleCancelSettings,
  });

  return (
    <ToolNamesContext.Provider value={toolNamesMap}>
      <div
        className={
          showSettings
            ? `pointer-events-none ${settingsClosing ? "settings-blur-out" : "settings-blur"}`
            : ""
        }
      >
        <ChatScreen
          messages={chat.messages}
          isAssistantResponding={chat.isAssistantResponding}
          rateLimitState={chat.rateLimitState}
          handleSend={wrappedHandleSend}
          handleRetry={chat.handleRetry}
          handleEdit={chat.handleEdit}
          headerInfo={{
            activeModel: chat.activeModel,
            activeProvider: chat.activeProvider,
            model: settings.model,
            provider: settings.provider,
            enabledToolsCount,
            totalToolsCount,
            smallModelMode:
              chat.activeSmallModelMode ?? settings.smallModelMode,
            defaultSmallModelMode: settings.smallModelMode,
            showHelpLinks: display.showHelpLinks,
          }}
          activeThinking={chat.activeThinking}
          defaultThinking={settings.thinking}
          mcpStatus={mcpStatus}
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          onOpenSettings={() => openSettings()}
          /* v8 ignore start -- inline settings tab navigation */
          onOpenToolsSettings={() => openSettings("tools")}
          onOpenConnectionSettings={() => openSettings("connection")}
          /* v8 ignore stop */
          onStop={chat.stopResponse}
          showTimestamps={display.showTimestamps}
          showTokenUsage={display.showTokenUsage}
          conversationPanel={conversationPanelState}
        />
      </div>
      {showSettings && (
        <div
          className={`settings-overlay ${settingsClosing ? "settings-closing" : ""}`}
          onClick={handleSettingsDismiss}
        >
          <SettingsScreen
            settings={settings}
            display={display}
            theme={theme}
            setTheme={setTheme}
            mcpTools={mcpTools}
            mcpStatus={mcpStatus}
            saveSettings={handleSaveSettings}
            cancelSettings={handleCancelSettings}
            activeTab={viewState.settingsTab}
            onTabChange={(tab: TabId) => setViewState({ settingsTab: tab })}
            shake={shake}
            onShakeEnd={clearShake}
            hasUnsavedChanges={hasUnsavedChanges}
            onDeleteAllConversations={handleDeleteAll}
            onDeleteUnbookmarkedConversations={handleDeleteUnbookmarked}
            conversationLock={{
              activeModel: chat.activeModel,
              activeProvider: chat.activeProvider,
              activeSmallModelMode: chat.activeSmallModelMode,
            }}
          />
        </div>
      )}
    </ToolNamesContext.Provider>
  );
}
