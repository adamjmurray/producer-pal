// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useMemo, useState } from "preact/hooks";
import {
  type AllProviderSettings,
  buildAllProviderSettings,
  loadProviderSettings,
  type ProviderSettings,
  type ProviderStateSetters,
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

export interface ProviderSlices extends ProviderConnections {
  providerStateSetters: ProviderStateSetters;
  /** OpenAI slice, read directly for voice routing (openaiApiKey). */
  openaiSettings: ProviderSettings;
  /** Gemini slice, read directly for voice routing (geminiApiKey). */
  geminiSettings: ProviderSettings;
}

/**
 * Own the eight per-provider settings slices plus the memoized setter map and
 * connection resolver. Extracted from useSettings so that orchestrator stays
 * within its function-length limit and the slice plumbing lives in one place.
 * @returns The combined provider settings + connection resolver, the
 *   per-provider setter map, and the OpenAI/Gemini slices read for voice routing
 */
export function useProviderSlices(): ProviderSlices {
  const [anthropicSettings, setAnthropicSettings] = useState<ProviderSettings>(
    () => loadProviderSettings("anthropic"),
  );
  const [geminiSettings, setGeminiSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("gemini"),
  );
  const [openaiSettings, setOpenaiSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("openai"),
  );
  const [mistralSettings, setMistralSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("mistral"),
  );
  const [openrouterSettings, setOpenrouterSettings] =
    useState<ProviderSettings>(() => loadProviderSettings("openrouter"));
  const [lmstudioSettings, setLmstudioSettings] = useState<ProviderSettings>(
    () => loadProviderSettings("lmstudio"),
  );
  const [ollamaSettings, setOllamaSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("ollama"),
  );
  const [customSettings, setCustomSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("custom"),
  );

  // Mapping of providers to their state setters
  const providerStateSetters: ProviderStateSetters = useMemo(
    () => ({
      anthropic: setAnthropicSettings,
      gemini: setGeminiSettings,
      openai: setOpenaiSettings,
      mistral: setMistralSettings,
      openrouter: setOpenrouterSettings,
      lmstudio: setLmstudioSettings,
      ollama: setOllamaSettings,
      custom: setCustomSettings,
    }),
    [],
  );

  const { providerSettings, getProviderConnection } = useProviderConnections(
    anthropicSettings,
    geminiSettings,
    openaiSettings,
    mistralSettings,
    openrouterSettings,
    lmstudioSettings,
    ollamaSettings,
    customSettings,
  );

  return {
    providerSettings,
    getProviderConnection,
    providerStateSetters,
    openaiSettings,
    geminiSettings,
  };
}
