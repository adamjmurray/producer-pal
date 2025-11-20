import type { Provider } from "../../types/settings";
import { ConnectionTab } from "./ConnectionTab";
import { RandomnessSlider } from "./RandomnessSlider";
import { SettingsTabs } from "./SettingsTabs";
import { ThinkingSettings } from "./ThinkingSettings";
import { ToolToggles } from "./ToolToggles";
import { VoiceSelector } from "./VoiceSelector";

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
// eslint-disable-next-line max-lines-per-function -- Settings screen requires complex tabbed UI
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
                <div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={resetBehaviorToDefaults}
                      className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                      Reset to defaults
                    </button>
                  </div>
                  <div className="space-y-4">
                    <ThinkingSettings
                      provider={provider}
                      model={model}
                      thinking={thinking}
                      setThinking={setThinking}
                      showThoughts={showThoughts}
                      setShowThoughts={setShowThoughts}
                    />
                    <div className="mt-8">
                      <RandomnessSlider
                        temperature={temperature}
                        setTemperature={setTemperature}
                      />
                    </div>
                    {provider === "gemini" && (
                      <div className="mt-8">
                        <VoiceSelector voice={voice} setVoice={setVoice} />
                      </div>
                    )}
                  </div>
                </div>
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
                <div>
                  <label htmlFor="theme-select" className="block text-sm mb-2">
                    Theme
                  </label>
                  <select
                    id="theme-select"
                    value={theme}
                    onChange={(e) =>
                      setTheme((e.target as HTMLSelectElement).value)
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </SettingsTabs>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
          {settingsConfigured
            ? "Note: Settings changes apply to new conversations."
            : "Settings will be stored in this web browser."}
        </p>
        <div className="flex gap-2 mt-4">
          <button
            onClick={saveSettings}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
          {settingsConfigured && (
            <button
              onClick={cancelSettings}
              className="px-4 py-2 bg-gray-600 text-white rounded"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
