// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { aiSdkAdapter } from "#webui/hooks/chat/ai-sdk-adapter";
import { useConversationHandlers } from "#webui/hooks/chat/helpers/use-conversation-handlers";
import { useConversationLock } from "#webui/hooks/chat/helpers/use-conversation-lock";
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
  useDisplaySettings,
  saveDisplaySettings,
} from "#webui/hooks/use-display-settings";
import { useViewState } from "#webui/hooks/use-view-state";
import { ChatScreen } from "./chat/ChatScreen";
import { SettingsScreen } from "./settings/SettingsScreen";
import { type TabId } from "./settings/SettingsTabs";

// Placeholder API key for local providers that don't require authentication
const LOCAL_PROVIDER_API_KEY = "not-needed";

/**
 * Check if viewport is below Tailwind's md breakpoint (768px)
 * @returns true on mobile-width screens
 */
export function isMobile(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

// Base URLs for each provider
const PROVIDER_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

/**
 * Normalize URL for local providers by ensuring /v1 suffix
 * @param {string} url - URL to normalize
 * @returns {string} - Normalized URL with /v1 suffix
 */
export function normalizeLocalProviderUrl(url: string): string {
  // Remove trailing slashes
  const trimmed = url.replace(/\/+$/, "");

  // Check if already ends with /v1
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }

  return `${trimmed}/v1`;
}

/**
 * Get API base URL for the current provider
 * @param {string} provider - Provider identifier
 * @param {string | undefined} baseUrl - Base URL for custom/local providers
 * @returns {string | undefined} - Base URL or undefined for Gemini
 */
export function getBaseUrl(
  provider: string,
  baseUrl: string | undefined,
): string | undefined {
  if (provider === "custom") return baseUrl;
  if (provider === "gemini") return undefined;

  if (provider === "lmstudio") {
    return normalizeLocalProviderUrl(baseUrl ?? "http://localhost:1234");
  }

  if (provider === "ollama") {
    return normalizeLocalProviderUrl(baseUrl ?? "http://localhost:11434");
  }

  return PROVIDER_BASE_URLS[provider as keyof typeof PROVIDER_BASE_URLS];
}

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
  const display = useDisplaySettings();
  const { mcpStatus, mcpError, mcpTools, checkMcpConnection } =
    useMcpConnection();
  const toolNamesMap = useMemo(
    () => Object.fromEntries(mcpTools?.map((t) => [t.id, t.name]) ?? []),
    [mcpTools],
  );
  const { serverSmallModelMode, postSmallModelMode } =
    useRemoteConfig(mcpStatus);
  const baseUrl = getBaseUrl(settings.provider, settings.baseUrl);

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
    adapter: aiSdkAdapter,
    extraParams: {
      baseUrl,
      showThoughts: settings.showThoughts,
      provider: settings.provider,
      apiKey:
        settings.provider === "lmstudio" || settings.provider === "ollama"
          ? settings.apiKey || LOCAL_PROVIDER_API_KEY
          : settings.apiKey,
    },
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

  const transfer = useConversationTransfer(conversationManager.refreshList);
  const {
    handleNew: handleNewConversation,
    handleSelect: handleSelectConversation,
    handleDelete: handleDeleteConversation,
    handleRename: handleRenameConversation,
    handleToggleBookmark,
  } = useConversationHandlers(conversationManager);

  const prevMessageCountRef = useRef(0); // Auto-save on message change

  useEffect(() => {
    if (chat.messages.length > prevMessageCountRef.current) {
      void conversationManager.saveCurrentConversation();
    }

    prevMessageCountRef.current = chat.messages.length;
  }, [chat.messages.length, conversationManager]);

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
      saveDisplaySettings(display);
    });
  };

  const handleCancelSettings = useCallback(() => {
    closeSettings(() => {
      settings.cancelSettings();
      setTheme(originalThemeRef.current);
      const orig = originalDisplayRef.current;

      display.setShowTimestamps(orig.showTimestamps);
      display.setShowHelpLinks(orig.showHelpLinks);
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
          onOpenToolsSettings={() => openSettings("tools")}
          onOpenConnectionSettings={() => openSettings("connection")}
          onStop={chat.stopResponse}
          showTimestamps={display.showTimestamps}
          conversationPanel={{
            conversations: conversationManager.conversations,
            activeConversationId: conversationManager.activeConversationId,
            isOpen: viewState.historyPanelOpen,
            onToggle: () =>
              setViewState({
                historyPanelOpen: !viewState.historyPanelOpen,
              }),
            onSelect: (id: string) => {
              handleSelectConversation(id);
              if (isMobile()) setViewState({ historyPanelOpen: false });
            },
            onNew: () => {
              handleNewConversation();
              if (isMobile()) setViewState({ historyPanelOpen: false });
            },
            onDelete: handleDeleteConversation,
            onExportItem: transfer.handleExportOne,
            onRename: handleRenameConversation,
            onToggleBookmark: handleToggleBookmark,
            onExport: () => void transfer.handleExport(),
            onImport: () => void transfer.handleImport(),
            notification:
              transfer.notification ?? conversationManager.limitNotification,
            onDismissNotification: transfer.notification
              ? transfer.dismissNotification
              : conversationManager.dismissLimitNotification,
          }}
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
