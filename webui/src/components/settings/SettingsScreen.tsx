import type { Provider } from "../../types/settings.js";
import { RandomnessSlider } from "./RandomnessSlider.jsx";
import { SettingsTabs } from "./SettingsTabs.jsx";
import { ThinkingSettings } from "./ThinkingSettings.jsx";
import { ToolToggles } from "./ToolToggles.jsx";
import { ConnectionTab } from "./ConnectionTab.jsx";

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
 *
 * @param provider
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
 *
 * @param root0
 * @param root0.provider
 * @param root0.setProvider
 * @param root0.apiKey
 * @param root0.setApiKey
 * @param root0.baseUrl
 * @param root0.setBaseUrl
 * @param root0.port
 * @param root0.setPort
 * @param root0.model
 * @param root0.setModel
 * @param root0.thinking
 * @param root0.setThinking
 * @param root0.temperature
 * @param root0.setTemperature
 * @param root0.showThoughts
 * @param root0.setShowThoughts
 * @param root0.theme
 * @param root0.setTheme
 * @param root0.enabledTools
 * @param root0.setEnabledTools
 * @param root0.enableAllTools
 * @param root0.disableAllTools
 * @param root0.resetBehaviorToDefaults
 * @param root0.saveSettings
 * @param root0.cancelSettings
 * @param root0.settingsConfigured
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
