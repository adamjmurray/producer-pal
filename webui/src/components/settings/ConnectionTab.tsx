// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { ThinkingStateIcon } from "#webui/components/chat/controls/ThinkingToggle";
import { type Provider } from "#webui/types/settings";
import { ModelSelector } from "./controls/ModelSelector";
import { ProviderSelector } from "./controls/ProviderSelector";
import { THINKING_LEVELS } from "./controls/thinking-levels";

export const API_KEY_URLS: Record<string, string | undefined> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  mistral: "https://console.mistral.ai/home?workspace_dialog=apiKeys",
  openrouter: "https://openrouter.ai/settings/keys",
};

export const MODEL_DOCS_URLS: Record<string, string | undefined> = {
  anthropic: "https://docs.anthropic.com/en/docs/about-claude/models",
  gemini: "https://ai.google.dev/gemini-api/docs/models",
  openai: "https://platform.openai.com/docs/models",
  mistral: "https://docs.mistral.ai/getting-started/models",
  openrouter: "https://openrouter.ai/models",
  lmstudio: "https://lmstudio.ai/models",
  ollama: "https://ollama.com/search",
};

export const DEFAULT_LOCAL_URLS: Record<string, string> = {
  lmstudio: "http://localhost:1234",
  ollama: "http://localhost:11434",
};

interface ConnectionTabProps {
  provider: Provider;
  setProvider: (provider: Provider) => void;
  apiKey: string;
  setApiKey: (apiKey: string) => void;
  baseUrl: string | null | undefined;
  setBaseUrl?: (baseUrl: string) => void;
  model: string;
  setModel: (model: string) => void;
  providerLabel: string;
  thinking: string;
  setThinking: (thinking: string) => void;
  smallModelMode: boolean;
  setSmallModelMode: (enabled: boolean) => void;
}

/**
 * Connection settings tab for provider, API key, and model
 * @param {ConnectionTabProps} props - Component props
 * @param {Provider} props.provider - Current provider
 * @param {(provider: Provider) => void} props.setProvider - Provider setter callback
 * @param {string} props.apiKey - API key
 * @param {(apiKey: string) => void} props.setApiKey - API key setter callback
 * @param {string | null | undefined} props.baseUrl - Base URL for custom and local providers
 * @param {(baseUrl: string) => void} [props.setBaseUrl] - Base URL setter callback
 * @param {string} props.model - Current model
 * @param {(model: string) => void} props.setModel - Model setter callback
 * @param {string} props.providerLabel - Display name for provider
 * @param {string} props.thinking - Default thinking level
 * @param {(thinking: string) => void} props.setThinking - Thinking level setter callback
 * @param {boolean} props.smallModelMode - Whether small model mode is enabled
 * @param {Function} props.setSmallModelMode - Function to toggle small model mode
 * @returns {JSX.Element} - React component
 */
export function ConnectionTab({
  provider,
  setProvider,
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  model,
  setModel,
  providerLabel,
  thinking,
  setThinking,
  smallModelMode,
  setSmallModelMode,
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
            className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
            data-testid="api-key-input"
          />
          {API_KEY_URLS[provider] && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
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

      {/* URL for local and custom providers */}
      {(provider === "lmstudio" ||
        provider === "ollama" ||
        provider === "custom") &&
        setBaseUrl && (
          <div>
            <label className="block text-sm mb-2">URL</label>
            <input
              type="text"
              value={baseUrl ?? ""}
              onChange={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
              placeholder={
                DEFAULT_LOCAL_URLS[provider] ?? "https://api.example.com/v1"
              }
              className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {DEFAULT_LOCAL_URLS[provider]
                ? `Default: ${DEFAULT_LOCAL_URLS[provider]}`
                : "OpenAI-compatible API endpoint"}
            </p>
          </div>
        )}

      <ModelSelector provider={provider} model={model} setModel={setModel} />
      {MODEL_DOCS_URLS[provider] && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-2">
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ThinkingStateIcon level={thinking} />
          <label htmlFor="thinking-select" className="text-sm shrink-0">
            Thinking
          </label>
          <select
            id="thinking-select"
            value={thinking}
            onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
            className="px-2 py-1 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded text-sm"
          >
            {THINKING_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            id="smallModelMode"
            checked={smallModelMode}
            onChange={(e) =>
              setSmallModelMode((e.target as HTMLInputElement).checked)
            }
          />
          Small model mode
        </label>
      </div>
    </>
  );
}
