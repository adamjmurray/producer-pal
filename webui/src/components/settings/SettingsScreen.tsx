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
  model: string;
  setModel: (model: string) => void;
  thinking: string;
  setThinking: (thinking: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
  saveSettings: () => void;
  cancelSettings: () => void;
  hasApiKey: boolean;
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
  model,
  setModel,
  thinking,
  setThinking,
  temperature,
  setTemperature,
  showThoughts,
  setShowThoughts,
  saveSettings,
  cancelSettings,
  hasApiKey,
  clearConversation,
  messageCount,
  activeModel,
}: SettingsScreenProps) {
  const providerLabel =
    provider === "gemini"
      ? "Gemini"
      : provider === "openai"
        ? "OpenAI"
        : provider === "groq"
          ? "Groq"
          : provider === "mistral"
            ? "Mistral"
            : provider === "openrouter"
              ? "OpenRouter"
              : "Custom";

  // Determine if we should show thinking settings
  const isO1OrO3Model = (m: string) => m === "o1" || m === "o3-mini";
  const shouldShowThinking =
    provider === "gemini" || (provider === "openai" && isO1OrO3Model(model));

  return (
    <div className="flex items-center justify-center h-screen p-4">
      <div className="max-w-md w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Producer Pal Chat Settings</h2>
        <ProviderSelector provider={provider} setProvider={setProvider} />

        {/* API Key Input */}
        <div>
          <label className="block text-sm mb-2">{providerLabel} API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
            placeholder={`Enter your ${providerLabel} API key`}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
          />
        </div>

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
        {shouldShowThinking && (
          <ThinkingSettings
            provider={provider}
            model={model}
            thinking={thinking}
            setThinking={setThinking}
            showThoughts={showThoughts}
            setShowThoughts={setShowThoughts}
          />
        )}
        <RandomnessSlider
          temperature={temperature}
          setTemperature={setTemperature}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {hasApiKey
            ? "Note: Settings changes apply to new conversations."
            : "Settings will be stored in this web browser."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={saveSettings}
            disabled={!apiKey}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
          {hasApiKey && (
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
