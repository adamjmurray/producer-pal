import type { Provider } from "#webui/types/settings";
import { AppearanceTab } from "./AppearanceTab";
import { BehaviorTab } from "./BehaviorTab";
import { ConnectionTab } from "./ConnectionTab";
import { ToolToggles } from "./controls/ToolToggles";
import { SettingsFooter } from "./SettingsFooter";
import { SettingsTabs } from "./SettingsTabs";

interface SettingsScreenProps {
  provider: Provider;
  setProvider: (provider: Provider) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  baseUrl?: string;
  setBaseUrl?: (url: string) => void;
  port?: number;
  setPort?: (port: number) => void;
  model: string;
  setModel: (model: string) => void;
  thinking: string;
  setThinking: (thinking: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
  voice: string;
  setVoice: (voice: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
  enableAllTools: () => void;
  disableAllTools: () => void;
  resetBehaviorToDefaults: () => void;
  saveSettings: () => void;
  cancelSettings: () => void;
  settingsConfigured: boolean;
}

/**
 * Gets a display label for the provider
 * @param {string} provider - The provider identifier
 * @returns {string} Display label for the provider
 */
function getProviderLabel(provider: string): string {
  switch (provider) {
    case "gemini":
      return "Gemini";
    case "openai":
      return "OpenAI";
    case "mistral":
      return "Mistral";
    case "openrouter":
      return "OpenRouter";
    case "lmstudio":
      return "LM Studio";
    case "ollama":
      return "Ollama";
    default:
      return "Custom";
  }
}

/**
 * Settings screen component
 * @param {object} root0 - Component props
 * @param {Provider} root0.provider - Selected provider
 * @param {Function} root0.setProvider - Function to update provider
 * @param {string} root0.apiKey - API key for the provider
 * @param {Function} root0.setApiKey - Function to update API key
 * @param {string} root0.baseUrl - Base URL for custom provider
 * @param {Function} root0.setBaseUrl - Function to update base URL
 * @param {number} root0.port - Port for local provider
 * @param {Function} root0.setPort - Function to update port
 * @param {string} root0.model - Selected model
 * @param {Function} root0.setModel - Function to update model
 * @param {string} root0.thinking - Thinking mode setting
 * @param {Function} root0.setThinking - Function to update thinking mode
 * @param {number} root0.temperature - Temperature/randomness setting
 * @param {Function} root0.setTemperature - Function to update temperature
 * @param {boolean} root0.showThoughts - Whether to show thought blocks
 * @param {Function} root0.setShowThoughts - Function to toggle thought display
 * @param {string} root0.voice - Voice selection for Gemini voice chat
 * @param {Function} root0.setVoice - Function to update voice
 * @param {string} root0.theme - UI theme setting
 * @param {Function} root0.setTheme - Function to update theme
 * @param {object} root0.enabledTools - Map of enabled/disabled tools
 * @param {Function} root0.setEnabledTools - Function to update enabled tools
 * @param {Function} root0.enableAllTools - Function to enable all tools
 * @param {Function} root0.disableAllTools - Function to disable all tools
 * @param {Function} root0.resetBehaviorToDefaults - Function to reset behavior settings
 * @param {Function} root0.saveSettings - Function to save settings
 * @param {Function} root0.cancelSettings - Function to cancel settings changes
 * @param {boolean} root0.settingsConfigured - Whether settings have been configured
 * @returns {JSX.Element} Settings screen component
 */
export function SettingsScreen({
  provider,
  setProvider,
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  port,
  setPort,
  model,
  setModel,
  thinking,
  setThinking,
  temperature,
  setTemperature,
  showThoughts,
  setShowThoughts,
  voice,
  setVoice,
  theme,
  setTheme,
  enabledTools,
  setEnabledTools,
  enableAllTools,
  disableAllTools,
  resetBehaviorToDefaults,
  saveSettings,
  cancelSettings,
  settingsConfigured,
}: SettingsScreenProps) {
  const providerLabel = getProviderLabel(provider);

  return (
    <div className="flex justify-center min-h-screen p-4 pt-20">
      <div className="max-w-md w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-6 self-start">
        <h2 className="text-xl font-semibold mb-4">
          Producer Pal Chat Settings
        </h2>

        <SettingsTabs>
          {(activeTab) => (
            <div className="space-y-4">
              {/* Connection Tab */}
              {activeTab === "connection" && (
                <ConnectionTab
                  provider={provider}
                  setProvider={setProvider}
                  apiKey={apiKey}
                  setApiKey={setApiKey}
                  baseUrl={baseUrl}
                  setBaseUrl={setBaseUrl}
                  port={port}
                  setPort={setPort}
                  model={model}
                  setModel={setModel}
                  providerLabel={providerLabel}
                />
              )}

              {/* Behavior Tab */}
              {activeTab === "behavior" && (
                <BehaviorTab
                  provider={provider}
                  model={model}
                  thinking={thinking}
                  setThinking={setThinking}
                  temperature={temperature}
                  setTemperature={setTemperature}
                  showThoughts={showThoughts}
                  setShowThoughts={setShowThoughts}
                  voice={voice}
                  setVoice={setVoice}
                  resetBehaviorToDefaults={resetBehaviorToDefaults}
                />
              )}

              {/* Tools Tab */}
              {activeTab === "tools" && (
                <ToolToggles
                  enabledTools={enabledTools}
                  setEnabledTools={setEnabledTools}
                  enableAllTools={enableAllTools}
                  disableAllTools={disableAllTools}
                />
              )}

              {/* Appearance Tab */}
              {activeTab === "appearance" && (
                <AppearanceTab theme={theme} setTheme={setTheme} />
              )}
            </div>
          )}
        </SettingsTabs>
        <SettingsFooter
          settingsConfigured={settingsConfigured}
          saveSettings={saveSettings}
          cancelSettings={cancelSettings}
        />
      </div>
    </div>
  );
}
