import type { Provider } from "../../types/settings.js";
import { ModelSelector } from "./ModelSelector.jsx";
import { ProviderSelector } from "./ProviderSelector.jsx";
import { ThinkingSettings } from "./ThinkingSettings.jsx";
import { RandomnessSlider } from "./RandomnessSlider.jsx";

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
  saveSettings: () => void;
  cancelSettings: () => void;
  settingsConfigured: boolean;
  clearConversation: () => void;
  messageCount: number;
  activeModel: string | null;
}

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
  saveSettings,
  cancelSettings,
  settingsConfigured,
  clearConversation,
  messageCount,
  activeModel,
}: SettingsScreenProps) {
  const apiKeyUrls: Record<string, string | undefined> = {
    gemini: "https://aistudio.google.com/apikey",
    openai: "https://platform.openai.com/api-keys",
    mistral: "https://console.mistral.ai/home?workspace_dialog=apiKeys",
    openrouter: "https://openrouter.ai/settings/keys",
  };

  const modelDocsUrls: Record<string, string | undefined> = {
    gemini: "https://ai.google.dev/gemini-api/docs/models",
    openai: "https://platform.openai.com/docs/models",
    mistral: "https://docs.mistral.ai/getting-started/models",
    openrouter: "https://openrouter.ai/models",
    lmstudio: "https://lmstudio.ai/models",
    ollama: "https://ollama.com/search",
  };

  const providerLabel =
    provider === "gemini"
      ? "Gemini"
      : provider === "openai"
        ? "OpenAI"
        : provider === "mistral"
          ? "Mistral"
          : provider === "openrouter"
            ? "OpenRouter"
            : provider === "lmstudio"
              ? "LM Studio"
              : provider === "ollama"
                ? "Ollama"
                : "Custom";

  return (
    <div className="flex items-center justify-center h-screen p-4">
      <div className="max-w-md w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Producer Pal Chat Settings</h2>
        <ProviderSelector provider={provider} setProvider={setProvider} />

        {/* API Key Input (not for local providers) */}
        {provider !== "lmstudio" && provider !== "ollama" && (
          <div>
            <label className="block text-sm mb-2">
              {providerLabel} API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
              placeholder={`Enter your ${providerLabel} API key`}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
            />
            {apiKeyUrls[provider] && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <a
                  href={apiKeyUrls[provider]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {providerLabel} API keys
                </a>
              </p>
            )}
          </div>
        )}

        {/* Port field for local providers */}
        {(provider === "lmstudio" || provider === "ollama") && setPort && (
          <div>
            <label className="block text-sm mb-2">Port</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={port?.toString() ?? ""}
              onChange={(e) => {
                const value = (e.target as HTMLInputElement).value;
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue)) {
                  setPort(numValue);
                }
              }}
              placeholder={provider === "lmstudio" ? "1234" : "11434"}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Base URL: http://localhost:
              {port ?? (provider === "lmstudio" ? 1234 : 11434)}/v1
            </p>
          </div>
        )}

        {/* Base URL (custom provider only) */}
        {provider === "custom" && setBaseUrl && (
          <div>
            <label className="block text-sm mb-2">Base URL</label>
            <input
              type="text"
              value={baseUrl ?? ""}
              onChange={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
              placeholder="https://api.example.com/v1"
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              OpenAI-compatible API endpoint
            </p>
          </div>
        )}

        <ModelSelector provider={provider} model={model} setModel={setModel} />
        {modelDocsUrls[provider] && (
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
            <a
              href={modelDocsUrls[provider]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {providerLabel} models
            </a>
          </p>
        )}
        <ThinkingSettings
          provider={provider}
          model={model}
          thinking={thinking}
          setThinking={setThinking}
          showThoughts={showThoughts}
          setShowThoughts={setShowThoughts}
        />
        <RandomnessSlider
          temperature={temperature}
          setTemperature={setTemperature}
        />
        <div>
          <label htmlFor="theme-select" className="block text-sm mb-2">
            Appearance
          </label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {settingsConfigured
            ? "Note: Settings changes apply to new conversations."
            : "Settings will be stored in this web browser."}
        </p>
        <div className="flex gap-2">
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
        {(messageCount > 0 || activeModel) && (
          <div className="pt-2 border-t border-gray-300 dark:border-gray-600">
            <button
              onClick={clearConversation}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Clear & Restart Conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
