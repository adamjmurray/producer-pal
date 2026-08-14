// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  API_KEY_URLS,
  DEFAULT_LOCAL_URLS,
} from "#webui/lib/constants/provider-urls";
import { type Provider } from "#webui/types/settings";
import { ModelSelector } from "./controls/ModelSelector";
import { ProviderSelector } from "./controls/ProviderSelector";
import {
  ModelDocsLink,
  SmallModelToggle,
  ThinkingSelector,
  VoiceSettings,
  type VoiceSettingsProps,
} from "./helpers/connection-tab-helpers";
import { TestConnectionButton } from "./TestConnectionButton";

/** Connection settings plus every prop forwarded verbatim to `VoiceSettings`. */
interface ConnectionTabProps extends VoiceSettingsProps {
  setProvider: (provider: Provider) => void;
  apiKey: string;
  setApiKey: (apiKey: string) => void;
  baseUrl: string | null | undefined;
  setBaseUrl?: (baseUrl: string) => void;
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
  ...voice
}: ConnectionTabProps) {
  return (
    <>
      <ProviderSelector provider={provider} setProvider={setProvider} />

      {/* API Key Input (not for local providers) */}
      {provider !== "lmstudio" && provider !== "ollama" && (
        <div>
          <label className="mb-2 block text-sm">{providerLabel} API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
            placeholder={`Enter your ${providerLabel} API key`}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700"
            data-testid="api-key-input"
          />
          {API_KEY_URLS[provider] && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
              <a
                href={API_KEY_URLS[provider]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {providerLabel} API keys
              </a>
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
            API keys are encrypted at rest in your browser; this is not a
            substitute for OS-level protection.
          </p>
        </div>
      )}

      {/* URL for local and custom providers */}
      {(provider === "lmstudio" ||
        provider === "ollama" ||
        provider === "custom") &&
        setBaseUrl && (
          <div>
            <label className="mb-2 block text-sm">URL</label>
            <input
              type="text"
              value={baseUrl ?? ""}
              onChange={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
              placeholder={
                DEFAULT_LOCAL_URLS[provider] ?? "https://api.example.com/v1"
              }
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
              {DEFAULT_LOCAL_URLS[provider]
                ? `Default: ${DEFAULT_LOCAL_URLS[provider]}`
                : "OpenAI-compatible API endpoint"}
            </p>
          </div>
        )}

      <TestConnectionButton
        provider={provider}
        apiKey={apiKey}
        baseUrl={baseUrl}
      />

      <ModelSelector provider={provider} model={model} setModel={setModel} />
      <ModelDocsLink provider={provider} providerLabel={providerLabel} />

      <VoiceSettings provider={provider} model={model} {...voice} />

      <div className="flex items-center justify-between">
        <ThinkingSelector thinking={thinking} setThinking={setThinking} />
        <SmallModelToggle
          smallModelMode={smallModelMode}
          setSmallModelMode={setSmallModelMode}
        />
      </div>
    </>
  );
}
