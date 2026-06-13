// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useMemo } from "preact/hooks";
import {
  type AllProviderSettings,
  buildAllProviderSettings,
  type ProviderSettings,
} from "#webui/hooks/settings/settings-helpers";
import { type Provider } from "#webui/types/settings";

export interface ProviderConnections {
  /** Per-provider settings, with a stable identity until one provider changes. */
  providerSettings: AllProviderSettings;
  /** Read a provider's stored connection (decrypted key + base URL). Stable. */
  getProviderConnection: (target: Provider) => {
    apiKey: string;
    baseUrl?: string;
  };
}

/**
 * Memoize the assembled per-provider settings plus a stable connection reader.
 * Several consumers (e.g. resolveConnection in useChatModeState) wrap the reader
 * in their own useCallback; a fresh object/function every render would defeat
 * that and churn the chat hook's downstream callbacks and effects. Extracted from
 * useSettings to keep that hook within its size budget.
 * @param anthropic - Anthropic settings
 * @param gemini - Gemini settings
 * @param openai - OpenAI settings
 * @param mistral - Mistral settings
 * @param openrouter - OpenRouter settings
 * @param lmstudio - LM Studio settings
 * @param ollama - Ollama settings
 * @param custom - Custom provider settings
 * @returns Memoized providerSettings and getProviderConnection
 */
export function useProviderConnections(
  anthropic: ProviderSettings,
  gemini: ProviderSettings,
  openai: ProviderSettings,
  mistral: ProviderSettings,
  openrouter: ProviderSettings,
  lmstudio: ProviderSettings,
  ollama: ProviderSettings,
  custom: ProviderSettings,
): ProviderConnections {
  const providerSettings = useMemo(
    () =>
      buildAllProviderSettings(
        anthropic,
        gemini,
        openai,
        mistral,
        openrouter,
        lmstudio,
        ollama,
        custom,
      ),
    [anthropic, gemini, openai, mistral, openrouter, lmstudio, ollama, custom],
  );

  // Read a specific provider's stored connection regardless of which provider is
  // currently active — lets a restored conversation locked to provider X keep
  // using X with the user's current key/baseUrl for X.
  const getProviderConnection = useCallback(
    (target: Provider): { apiKey: string; baseUrl?: string } => ({
      apiKey: providerSettings[target].apiKey,
      baseUrl: providerSettings[target].baseUrl,
    }),
    [providerSettings],
  );

  return { providerSettings, getProviderConnection };
}
