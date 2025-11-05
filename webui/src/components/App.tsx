import { useState } from "preact/hooks";
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
    mcpStatus,
    mcpError,
    checkMcpConnection,
  });

  // Route to appropriate chat based on provider
  const chat = settings.provider === "gemini" ? geminiChat : openaiChat;

  const [showSettings, setShowSettings] = useState(
    !settings.settingsConfigured,
  );

  const handleSaveSettings = () => {
    settings.saveSettings();
    setShowSettings(false);
  };

  const handleCancelSettings = () => {
    settings.cancelSettings();
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
        saveSettings={handleSaveSettings}
        cancelSettings={handleCancelSettings}
        hasApiKey={settings.hasApiKey}
        clearConversation={chat.clearConversation}
        messageCount={chat.messages.length}
        activeModel={chat.activeModel}
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
      mcpStatus={mcpStatus}
      mcpError={mcpError}
      checkMcpConnection={checkMcpConnection}
      theme={theme}
      setTheme={setTheme}
      onOpenSettings={() => setShowSettings(true)}
    />
  );
}
