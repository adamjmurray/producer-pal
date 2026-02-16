// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, useEffect, useRef } from "preact/hooks";
import { geminiAdapter } from "#webui/hooks/chat/gemini-adapter";
import { useConversationLock } from "#webui/hooks/chat/helpers/use-conversation-lock";
import { openaiChatAdapter } from "#webui/hooks/chat/openai-chat-adapter";
import { responsesAdapter } from "#webui/hooks/chat/responses-adapter";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useTheme } from "#webui/hooks/theme/use-theme";
import { ChatScreen } from "./chat/ChatScreen";
import { SettingsScreen } from "./settings/SettingsScreen";

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
  const { mcpStatus, mcpError, mcpTools, checkMcpConnection } =
    useMcpConnection();
  const baseUrl = getBaseUrl(settings.provider, settings.baseUrl);

  // Use Gemini chat for Gemini provider
  const geminiChat = useChat({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    thinking: settings.thinking,
    temperature: settings.temperature,
    enabledTools: settings.enabledTools,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    adapter: geminiAdapter,
    extraParams: { showThoughts: settings.showThoughts },
  });

  // Use OpenAI Chat Completions API for OpenAI-compatible providers (OpenRouter, Mistral, etc.)
  const openaiChat = useChat({
    provider: settings.provider,
    apiKey:
      settings.provider === "lmstudio" || settings.provider === "ollama"
        ? settings.apiKey || "not-needed"
        : settings.apiKey,
    model: settings.model,
    thinking: settings.thinking,
    temperature: settings.temperature,
    enabledTools: settings.enabledTools,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    adapter: openaiChatAdapter,
    extraParams: {
      baseUrl,
      showThoughts: settings.showThoughts,
      provider: settings.provider,
    },
  });

  // Use OpenAI Responses API for OpenAI and LM Studio providers
  const responsesChat = useChat({
    provider: settings.provider,
    apiKey:
      settings.provider === "lmstudio"
        ? settings.apiKey || "not-needed"
        : settings.apiKey,
    model: settings.model,
    thinking: settings.thinking,
    temperature: settings.temperature,
    enabledTools: settings.enabledTools,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    adapter: responsesAdapter,
    extraParams: {
      showThoughts: settings.showThoughts,
      baseUrl: settings.provider === "lmstudio" ? baseUrl : undefined,
    },
  });

  // Lock conversation to the provider used when chat started
  const { chat, wrappedHandleSend, wrappedClearConversation } =
    useConversationLock({
      settingsProvider: settings.provider,
      geminiChat,
      openaiChat,
      responsesChat,
    });

  // Calculate tools counts for header display
  const totalToolsCount = mcpTools?.length ?? 0;
  const enabledToolsCount = mcpTools
    ? mcpTools.filter((t) => settings.enabledTools[t.id] !== false).length
    : 0;

  const [showSettings, setShowSettings] = useState(
    !settings.settingsConfigured,
  );

  // Track original theme when settings opened (for cancel)
  const originalThemeRef = useRef(theme);
  const prevShowSettingsRef = useRef(showSettings);

  // Save original theme only when settings transitions from closed to open
  useEffect(() => {
    if (showSettings && !prevShowSettingsRef.current) {
      originalThemeRef.current = theme;
    }

    prevShowSettingsRef.current = showSettings;
  }, [showSettings, theme]);

  const handleSaveSettings = () => {
    settings.saveSettings();
    // Theme already applied via setTheme, no action needed
    setShowSettings(false);
  };

  const handleCancelSettings = () => {
    settings.cancelSettings();
    setTheme(originalThemeRef.current); // Revert theme to original
    setShowSettings(false);
  };

  if (showSettings) {
    return (
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
        enabledTools={settings.enabledTools}
        setEnabledTools={settings.setEnabledTools}
        mcpTools={mcpTools}
        mcpStatus={mcpStatus}
        resetBehaviorToDefaults={settings.resetBehaviorToDefaults}
        saveSettings={handleSaveSettings}
        cancelSettings={handleCancelSettings}
        settingsConfigured={settings.settingsConfigured}
      />
    );
  }

  return (
    <ChatScreen
      messages={chat.messages}
      isAssistantResponding={chat.isAssistantResponding}
      rateLimitState={chat.rateLimitState}
      handleSend={wrappedHandleSend}
      handleRetry={chat.handleRetry}
      activeModel={chat.activeModel}
      activeProvider={chat.activeProvider}
      provider={settings.provider}
      model={settings.model}
      defaultThinking={settings.thinking}
      defaultTemperature={settings.temperature}
      defaultShowThoughts={settings.showThoughts}
      enabledToolsCount={enabledToolsCount}
      totalToolsCount={totalToolsCount}
      mcpStatus={mcpStatus}
      mcpError={mcpError}
      checkMcpConnection={checkMcpConnection}
      onOpenSettings={() => setShowSettings(true)}
      onClearConversation={wrappedClearConversation}
      onStop={chat.stopResponse}
    />
  );
}
