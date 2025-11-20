import { useState, useEffect, useRef } from "preact/hooks";
import { useGeminiChat } from "../hooks/use-gemini-chat.js";
import { useMcpConnection } from "../hooks/use-mcp-connection.js";
import { useOpenAIChat } from "../hooks/use-openai-chat.js";
import { useSettings } from "../hooks/use-settings.js";
import { useTheme } from "../hooks/use-theme.js";
import { ChatScreen } from "./chat/ChatScreen.jsx";
import { SettingsScreen } from "./settings/SettingsScreen.jsx";

// Base URLs for each provider
const PROVIDER_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

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
      handleSend={chat.handleSend}
      handleRetry={chat.handleRetry}
      activeModel={chat.activeModel}
      activeThinking={chat.activeThinking}
      activeTemperature={chat.activeTemperature}
      activeProvider={chat.activeModel ? settings.provider : null}
      mcpStatus={mcpStatus}
      mcpError={mcpError}
      checkMcpConnection={checkMcpConnection}
      onOpenSettings={() => setShowSettings(true)}
      onClearConversation={chat.clearConversation}
      onStop={chat.stopResponse}
      apiKey={settings.apiKey}
      model={settings.model}
      temperature={settings.temperature}
      mcpUrl="http://localhost:3350/mcp"
      enabledTools={settings.enabledTools}
      enableVoice={settings.provider === "gemini"}
    />
  );
}
