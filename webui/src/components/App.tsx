// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { aiSdkAdapter } from "#webui/hooks/chat/ai-sdk-adapter";
import { useConversationLock } from "#webui/hooks/chat/helpers/use-conversation-lock";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import { ToolNamesContext } from "#webui/hooks/connection/tool-names-context";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useSettingsClose } from "#webui/hooks/settings/use-settings-close";
import { useTheme } from "#webui/hooks/theme/use-theme";
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
 *
 * @returns {JSX.Element} - React component
 */
export function App() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const { viewState, setViewState } = useViewState();
  const [showTimestamps, setShowTimestamps] = useState(
    () => localStorage.getItem("producer_pal_show_timestamps") === "true",
  );
  const [showHelpLinks, setShowHelpLinks] = useState(
    () => localStorage.getItem("producer_pal_show_help_links") !== "false",
  );
  const [showMessageSettings, setShowMessageSettings] = useState(
    () => localStorage.getItem("producer_pal_show_message_settings") === "true",
  );
  const { mcpStatus, mcpError, mcpTools, checkMcpConnection } =
    useMcpConnection();
  const toolNamesMap = useMemo(() => {
    if (!mcpTools) return {};
    const map: Record<string, string> = {};

    for (const tool of mcpTools) {
      map[tool.id] = tool.name;
    }

    return map;
  }, [mcpTools]);
  const { smallModelMode, setSmallModelMode } = useRemoteConfig(mcpStatus);
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

  const conversationManager = useConversations({
    getChatHistory: chat.getChatHistory,
    restoreChatHistory: chat.restoreChatHistory,
    clearConversation: wrappedClearConversation,
    activeModel: chat.activeModel,
    activeProvider: chat.activeProvider,
  });

  const transfer = useConversationTransfer(conversationManager.refreshList);

  // Auto-save when messages change (new user message or completed response)
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    if (chat.messages.length > prevMessageCountRef.current) {
      void conversationManager.saveCurrentConversation();
    }

    prevMessageCountRef.current = chat.messages.length;
  }, [chat.messages.length, conversationManager]);

  const handleNewConversation = useCallback(() => {
    void conversationManager.startNewConversation();
  }, [conversationManager]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      void conversationManager.switchConversation(id);
    },
    [conversationManager],
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      void conversationManager.deleteConversation(id);
    },
    [conversationManager],
  );

  const handleRenameConversation = useCallback(
    (id: string, title: string | null) => {
      void conversationManager.renameConversation(id, title);
    },
    [conversationManager],
  );

  const handleToggleBookmark = useCallback(
    (id: string) => {
      void conversationManager.toggleBookmark(id);
    },
    [conversationManager],
  );

  // Calculate tools counts for header display
  const totalToolsCount = mcpTools?.length ?? 0;
  const enabledToolsCount = mcpTools
    ? mcpTools.filter((t) => settings.enabledTools[t.id] !== false).length
    : 0;

  const showSettings = viewState.settingsOpen || !settings.settingsConfigured;
  const { settingsClosing, closeSettings } = useSettingsClose(setViewState);

  // Track original appearance settings when settings opened (for cancel)
  const originalThemeRef = useRef(theme);
  const originalShowTimestampsRef = useRef(showTimestamps);
  const originalShowHelpLinksRef = useRef(showHelpLinks);
  const originalShowMessageSettingsRef = useRef(showMessageSettings);
  const prevShowSettingsRef = useRef(showSettings);

  // Save originals only when settings transitions from closed to open
  useEffect(() => {
    if (showSettings && !prevShowSettingsRef.current) {
      originalThemeRef.current = theme;
      originalShowTimestampsRef.current = showTimestamps;
      originalShowHelpLinksRef.current = showHelpLinks;
      originalShowMessageSettingsRef.current = showMessageSettings;
    }

    prevShowSettingsRef.current = showSettings;
  }, [showSettings, theme, showTimestamps, showHelpLinks, showMessageSettings]);

  const handleSaveSettings = () => {
    closeSettings(() => {
      settings.saveSettings();

      const set = (k: string, v: boolean) =>
        localStorage.setItem(`producer_pal_${k}`, String(v));

      set("show_timestamps", showTimestamps);
      set("show_help_links", showHelpLinks);
      set("show_message_settings", showMessageSettings);
    });
  };

  const handleCancelSettings = () => {
    closeSettings(() => {
      settings.cancelSettings();
      setTheme(originalThemeRef.current);
      setShowTimestamps(originalShowTimestampsRef.current);
      setShowHelpLinks(originalShowHelpLinksRef.current);
      setShowMessageSettings(originalShowMessageSettingsRef.current);
    });
  };

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
          activeModel={chat.activeModel}
          activeProvider={chat.activeProvider}
          provider={settings.provider}
          model={settings.model}
          defaultThinking={settings.thinking}
          defaultTemperature={settings.temperature}
          defaultShowThoughts={settings.showThoughts}
          enabledToolsCount={enabledToolsCount}
          totalToolsCount={totalToolsCount}
          smallModelMode={smallModelMode}
          mcpStatus={mcpStatus}
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          onOpenSettings={() => setViewState({ settingsOpen: true })}
          onStop={chat.stopResponse}
          showTimestamps={showTimestamps}
          showHelpLinks={showHelpLinks}
          showMessageSettings={showMessageSettings}
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
        >
          <SettingsScreen
            activeTab={viewState.settingsTab}
            onTabChange={(tab: TabId) => setViewState({ settingsTab: tab })}
            provider={settings.provider}
            setProvider={settings.setProvider}
            apiKey={settings.apiKey}
            setApiKey={settings.setApiKey}
            baseUrl={settings.baseUrl}
            setBaseUrl={settings.setBaseUrl}
            model={settings.model}
            setModel={settings.setModel}
            thinking={settings.thinking}
            setThinking={settings.setThinking}
            temperature={settings.temperature}
            setTemperature={settings.setTemperature}
            showThoughts={settings.showThoughts}
            setShowThoughts={settings.setShowThoughts}
            theme={theme}
            setTheme={setTheme}
            showTimestamps={showTimestamps}
            setShowTimestamps={setShowTimestamps}
            showHelpLinks={showHelpLinks}
            setShowHelpLinks={setShowHelpLinks}
            showMessageSettings={showMessageSettings}
            setShowMessageSettings={setShowMessageSettings}
            enabledTools={settings.enabledTools}
            setEnabledTools={settings.setEnabledTools}
            mcpTools={mcpTools}
            mcpStatus={mcpStatus}
            smallModelMode={smallModelMode}
            setSmallModelMode={setSmallModelMode}
            resetBehaviorToDefaults={settings.resetBehaviorToDefaults}
            saveSettings={handleSaveSettings}
            cancelSettings={handleCancelSettings}
            settingsConfigured={settings.settingsConfigured}
          />
        </div>
      )}
    </ToolNamesContext.Provider>
  );
}
