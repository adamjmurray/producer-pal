import type { Provider } from "#webui/types/settings";
import { ModelSelector } from "./controls/ModelSelector";
import { ProviderSelector } from "./controls/ProviderSelector";

const API_KEY_URLS: Record<string, string | undefined> = {
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  mistral: "https://console.mistral.ai/home?workspace_dialog=apiKeys",
  openrouter: "https://openrouter.ai/settings/keys",
};

const MODEL_DOCS_URLS: Record<string, string | undefined> = {
  gemini: "https://ai.google.dev/gemini-api/docs/models",
  openai: "https://platform.openai.com/docs/models",
  mistral: "https://docs.mistral.ai/getting-started/models",
  openrouter: "https://openrouter.ai/models",
  lmstudio: "https://lmstudio.ai/models",
  ollama: "https://ollama.com/search",
};

interface ConnectionTabProps {
  provider: Provider;
  setProvider: (provider: Provider) => void;
  apiKey: string;
  setApiKey: (apiKey: string) => void;
  baseUrl: string | null | undefined;
  setBaseUrl?: (baseUrl: string) => void;
  port: number | null | undefined;
  setPort?: (port: number) => void;
  model: string;
  setModel: (model: string) => void;
  providerLabel: string;
}

/**
 * Connection settings tab for provider, API key, and model
 * @param {ConnectionTabProps} root0 - Component props
 * @param {Provider} root0.provider - Current provider
 * @param {(provider: Provider) => void} root0.setProvider - Provider setter callback
 * @param {string} root0.apiKey - API key
 * @param {(apiKey: string) => void} root0.setApiKey - API key setter callback
 * @param {string | null | undefined} root0.baseUrl - Base URL for custom provider
 * @param {(baseUrl: string) => void} [root0.setBaseUrl] - Base URL setter callback
 * @param {number | null | undefined} root0.port - Port for local providers
 * @param {(port: number) => void} [root0.setPort] - Port setter callback
 * @param {string} root0.model - Current model
 * @param {(model: string) => void} root0.setModel - Model setter callback
 * @param {string} root0.providerLabel - Display name for provider
 * @returns {JSX.Element} - React component
 */
export function ConnectionTab({
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
  providerLabel,
}: ConnectionTabProps) {
  return (
    <>
      <ProviderSelector provider={provider} setProvider={setProvider} />

      {/* API Key Input (not for local providers) */}
      {provider !== "lmstudio" && provider !== "ollama" && (
        <div>
          <label className="block text-sm mb-2">{providerLabel} API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
            placeholder={`Enter your ${providerLabel} API key`}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
            data-testid="api-key-input"
          />
          {API_KEY_URLS[provider] && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              <a
                href={API_KEY_URLS[provider]}
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
      {MODEL_DOCS_URLS[provider] && (
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          <a
            href={MODEL_DOCS_URLS[provider]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {providerLabel} models
          </a>
        </p>
      )}
    </>
  );
}
