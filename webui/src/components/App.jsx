import { useState } from "preact/hooks";
import { useGeminiChat } from "../hooks/useGeminiChat.js";
import { useMcpConnection } from "../hooks/useMcpConnection.js";
import { useSettings } from "../hooks/useSettings.js";
import { useTheme } from "../hooks/useTheme.js";
import { ChatScreen } from "./chat/ChatScreen.jsx";
import { SettingsScreen } from "./settings/SettingsScreen.jsx";

export function App() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const { mcpStatus, mcpError, checkMcpConnection } = useMcpConnection();

  const chat = useGeminiChat({
    apiKey: settings.apiKey,
    model: settings.model,
    thinking: settings.thinking,
    temperature: settings.temperature,
    showThoughts: settings.showThoughts,
    mcpStatus,
    mcpError,
    checkMcpConnection,
  });

  const [showSettings, setShowSettings] = useState(!settings.hasApiKey);

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
        apiKey={settings.apiKey}
        setApiKey={settings.setApiKey}
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
