import { useState, useEffect, useRef } from "preact/hooks";
import { geminiAdapter } from "#webui/hooks/chat/gemini-adapter";
import { useConversationLock } from "#webui/hooks/chat/helpers/use-conversation-lock";
import { openaiAdapter } from "#webui/hooks/chat/openai-adapter";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useTheme } from "#webui/hooks/theme/use-theme";
import { TOOLS } from "#webui/lib/constants/tools";
import { ChatScreen } from "./chat/ChatScreen";
import { SettingsScreen } from "./settings/SettingsScreen";

// Base URLs for each provider
const PROVIDER_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

// Filter tools that are visible (not requiring env var unless it's set)
const VISIBLE_TOOLS = TOOLS.filter(
  (tool) => !tool.requiresEnvVar || import.meta.env.ENABLE_RAW_LIVE_API,
);

/**
 * Calculate the number of enabled tools
 * @param {Record<string, boolean>} enabledTools - Map of tool IDs to enabled state
 * @returns {number} - Number of enabled tools
 */
function getEnabledToolsCount(enabledTools: Record<string, boolean>): number {
  return VISIBLE_TOOLS.filter((tool) => enabledTools[tool.id] !== false).length;
}

/**
 * Get API base URL for the current provider
 * @param {string} provider - Provider identifier
 * @param {string | undefined} baseUrl - Custom base URL for custom provider
 * @param {number | undefined} port - Port for local providers
 * @returns {string | undefined} - Base URL or undefined for Gemini
 */
function getBaseUrl(
  provider: string,
  baseUrl: string | undefined,
  port: number | undefined,
): string | undefined {
  if (provider === "custom") return baseUrl;
  if (provider === "gemini") return undefined;
  if (provider === "lmstudio") return `http://localhost:${port ?? 1234}/v1`;
  if (provider === "ollama") return `http://localhost:${port ?? 11434}/v1`;

  return PROVIDER_BASE_URLS[provider as keyof typeof PROVIDER_BASE_URLS];
}

/**
 *
 * @returns {JSX.Element} - React component
 */
// eslint-disable-next-line max-lines-per-function
export function App() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const { mcpStatus, mcpError, checkMcpConnection } = useMcpConnection();
  const baseUrl = getBaseUrl(
    settings.provider,
    settings.baseUrl,
    settings.port,
  );

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

  // Use OpenAI chat for OpenAI-compatible providers
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
    adapter: openaiAdapter,
    extraParams: { baseUrl, showThoughts: settings.showThoughts },
  });

  // Lock conversation to the provider used when chat started
  const { chat, wrappedHandleSend, wrappedClearConversation } =
    useConversationLock({
      settingsProvider: settings.provider,
      geminiChat,
      openaiChat,
    });

  // Calculate tools counts for header display
  const enabledToolsCount = getEnabledToolsCount(settings.enabledTools);

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
        port={settings.port}
        setPort={settings.setPort}
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
        enableAllTools={settings.enableAllTools}
        disableAllTools={settings.disableAllTools}
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
      totalToolsCount={VISIBLE_TOOLS.length}
      mcpStatus={mcpStatus}
      mcpError={mcpError}
      checkMcpConnection={checkMcpConnection}
      onOpenSettings={() => setShowSettings(true)}
      onClearConversation={wrappedClearConversation}
      onStop={chat.stopResponse}
    />
  );
}
