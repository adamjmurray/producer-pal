// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "preact/hooks";
import { aiSdkAdapter } from "#webui/hooks/chat/ai-sdk-adapter";
import { useConversationLock } from "#webui/hooks/chat/helpers/use-conversation-lock";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import { ToolNamesContext } from "#webui/hooks/connection/tool-names-context";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useTheme } from "#webui/hooks/theme/use-theme";
import { ChatScreen } from "./chat/ChatScreen";
import { SettingsScreen } from "./settings/SettingsScreen";

// Placeholder API key for local providers that don't require authentication
const LOCAL_PROVIDER_API_KEY = "not-needed";

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
function normalizeLocalProviderUrl(url: string): string {
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
function getBaseUrl(
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
  const [showTimestamps, setShowTimestamps] = useState(
    () => localStorage.getItem("producer_pal_show_timestamps") === "true",
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
    loadConversation: chat.loadConversation,
    clearConversation: wrappedClearConversation,
  });

  // Auto-save after each completed assistant turn
  const wasRespondingRef = useRef(false);

  useEffect(() => {
    if (wasRespondingRef.current && !chat.isAssistantResponding) {
      void conversationManager.saveCurrentConversation();
    }

    wasRespondingRef.current = chat.isAssistantResponding;
  }, [chat.isAssistantResponding, conversationManager]);

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

  // Calculate tools counts for header display
  const totalToolsCount = mcpTools?.length ?? 0;
  const enabledToolsCount = mcpTools
    ? mcpTools.filter((t) => settings.enabledTools[t.id] !== false).length
    : 0;

  const [showSettings, setShowSettings] = useState(
    !settings.settingsConfigured,
  );

  // Track original appearance settings when settings opened (for cancel)
  const originalThemeRef = useRef(theme);
  const originalShowTimestampsRef = useRef(showTimestamps);
  const prevShowSettingsRef = useRef(showSettings);

  // Save originals only when settings transitions from closed to open
  useEffect(() => {
    if (showSettings && !prevShowSettingsRef.current) {
      originalThemeRef.current = theme;
      originalShowTimestampsRef.current = showTimestamps;
    }

    prevShowSettingsRef.current = showSettings;
  }, [showSettings, theme, showTimestamps]);

  const handleSaveSettings = () => {
    settings.saveSettings();
    localStorage.setItem(
      "producer_pal_show_timestamps",
      String(showTimestamps),
    );
    setShowSettings(false);
  };

  const handleCancelSettings = () => {
    settings.cancelSettings();
    setTheme(originalThemeRef.current);
    setShowTimestamps(originalShowTimestampsRef.current);
    setShowSettings(false);
  };

  if (showSettings) {
    return (
      <ToolNamesContext.Provider value={toolNamesMap}>
        <SettingsScreen
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
      </ToolNamesContext.Provider>
    );
  }

  return (
    <ToolNamesContext.Provider value={toolNamesMap}>
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
        onOpenSettings={() => setShowSettings(true)}
        onStop={chat.stopResponse}
        showTimestamps={showTimestamps}
        conversationPanel={{
          conversations: conversationManager.conversations,
          activeConversationId: conversationManager.activeConversationId,
          isOpen: conversationManager.isPanelOpen,
          onToggle: conversationManager.togglePanel,
          onSelect: handleSelectConversation,
          onNew: handleNewConversation,
          onDelete: handleDeleteConversation,
          onRename: handleRenameConversation,
        }}
      />
    </ToolNamesContext.Provider>
  );
}
