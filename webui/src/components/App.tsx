import { useState, useEffect, useRef } from "preact/hooks";
import { useGeminiChat } from "#webui/hooks/chat/use-gemini-chat";
import { useOpenAIChat } from "#webui/hooks/chat/use-openai-chat";
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
 *
 * @returns {JSX.Element} - React component
 */
export function App() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const { mcpStatus, mcpError, checkMcpConnection } = useMcpConnection();

  // Determine base URL for OpenAI-compatible providers
  const baseUrl =
    settings.provider === "custom"
      ? settings.baseUrl
      : settings.provider === "gemini"
        ? undefined
        : settings.provider === "lmstudio"
          ? `http://localhost:${settings.port ?? 1234}/v1`
          : settings.provider === "ollama"
            ? `http://localhost:${settings.port ?? 11434}/v1`
            : PROVIDER_BASE_URLS[settings.provider];

  // Use Gemini chat for Gemini provider
  const geminiChat = useGeminiChat({
    apiKey: settings.apiKey,
    model: settings.model,
    thinking: settings.thinking,
    temperature: settings.temperature,
    showThoughts: settings.showThoughts,
    enabledTools: settings.enabledTools,
    mcpStatus,
    mcpError,
    checkMcpConnection,
  });

  // Use OpenAI chat for OpenAI-compatible providers
  const openaiChat = useOpenAIChat({
    apiKey:
      settings.provider === "lmstudio" || settings.provider === "ollama"
        ? settings.apiKey || "not-needed"
        : settings.apiKey,
    model: settings.model,
    thinking: settings.thinking,
    temperature: settings.temperature,
    baseUrl,
    enabledTools: settings.enabledTools,
    mcpStatus,
    mcpError,
    checkMcpConnection,
  });

  // Route to appropriate chat based on provider
  const chat = settings.provider === "gemini" ? geminiChat : openaiChat;

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
      handleSend={chat.handleSend}
      handleRetry={chat.handleRetry}
      activeModel={chat.activeModel}
      activeThinking={chat.activeThinking}
      activeTemperature={chat.activeTemperature}
      activeProvider={chat.activeModel ? settings.provider : null}
      defaultThinking={settings.thinking}
      defaultTemperature={settings.temperature}
      enabledToolsCount={enabledToolsCount}
      totalToolsCount={VISIBLE_TOOLS.length}
      mcpStatus={mcpStatus}
      mcpError={mcpError}
      checkMcpConnection={checkMcpConnection}
      onOpenSettings={() => setShowSettings(true)}
      onClearConversation={chat.clearConversation}
      onStop={chat.stopResponse}
    />
  );
}
