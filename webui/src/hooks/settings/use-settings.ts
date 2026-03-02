// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { type Provider, type UseSettingsReturn } from "#webui/types/settings";
import {
  buildAllProviderSettings,
  checkHasApiKey,
  DEFAULT_SETTINGS,
  loadAllProviderSettings,
  loadCurrentProvider,
  loadEnabledTools,
  loadProviderSettings,
  type ProviderSettings,
  saveCurrentSettings,
} from "./settings-helpers";

type ProviderStateSetters = Record<
  Provider,
  (update: (prev: ProviderSettings) => ProviderSettings) => void
>;

/**
 * Create a setter function for a specific provider setting
 *
 * @param {Provider} provider - The provider to update
 * @param {ProviderStateSetters} setters - Map of provider state setters
 * @param {K} key - The setting key to update
 * @returns {(value: ProviderSettings[K]) => void} Setter function
 */
function createProviderSetter<K extends keyof ProviderSettings>(
  provider: Provider,
  setters: ProviderStateSetters,
  key: K,
) {
  return (value: ProviderSettings[K]) => {
    setters[provider]((prev) => ({ ...prev, [key]: value }));
  };
}

// Hook manages state for 7 providers with individual setters and orchestration logic

/**
 * Hook for managing chat provider settings and tool enablement
 *
 * @returns {UseSettingsReturn} Settings state and management functions
 */
export function useSettings(): UseSettingsReturn {
  const [provider, setProviderState] = useState<Provider>(loadCurrentProvider);
  const [settingsConfigured, setSettingsConfigured] = useState<boolean>(
    () => localStorage.getItem("producer_pal_settings_configured") === "true",
  );
  const [enabledTools, setEnabledToolsState] =
    useState<Record<string, boolean>>(loadEnabledTools);
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

  const currentSettings = {
    gemini: geminiSettings,
    openai: openaiSettings,
    mistral: mistralSettings,
    openrouter: openrouterSettings,
    lmstudio: lmstudioSettings,
    ollama: ollamaSettings,
    custom: customSettings,
  }[provider];

  const applyLoadedSettings = useCallback(
    (allSettings: typeof DEFAULT_SETTINGS) => {
      setGeminiSettings(allSettings.gemini);
      setOpenaiSettings(allSettings.openai);
      setMistralSettings(allSettings.mistral);
      setOpenrouterSettings(allSettings.openrouter);
      setLmstudioSettings(allSettings.lmstudio);
      setOllamaSettings(allSettings.ollama);
      setCustomSettings(allSettings.custom);
    },
    [],
  );

  useEffect(() => {
    applyLoadedSettings(loadAllProviderSettings());
  }, [applyLoadedSettings]);

  const saveSettings = useCallback(() => {
    const allSettings = buildAllProviderSettings(
      geminiSettings,
      openaiSettings,
      mistralSettings,
      openrouterSettings,
      lmstudioSettings,
      ollamaSettings,
      customSettings,
    );

    saveCurrentSettings(provider, enabledTools, allSettings);
    setSettingsConfigured(true);
  }, [
    provider,
    enabledTools,
    geminiSettings,
    openaiSettings,
    mistralSettings,
    openrouterSettings,
    lmstudioSettings,
    ollamaSettings,
    customSettings,
  ]);

  const cancelSettings = useCallback(() => {
    setProviderState(loadCurrentProvider());
    setEnabledToolsState(loadEnabledTools());
    applyLoadedSettings(loadAllProviderSettings());
  }, [applyLoadedSettings]);

  // Individual setters that update the current provider's settings
  const setters = useMemo(() => {
    const createSetter =
      <K extends keyof ProviderSettings>(key: K) =>
      (value: ProviderSettings[K]) =>
        createProviderSetter(provider, providerStateSetters, key)(value);

    const hasBaseUrl =
      provider === "custom" || provider === "lmstudio" || provider === "ollama";

    return {
      setApiKey: createSetter("apiKey"),
      setModel: createSetter("model"),
      setBaseUrl: hasBaseUrl ? createSetter("baseUrl") : undefined,
      setThinking: createSetter("thinking"),
      setTemperature: createSetter("temperature"),
      setShowThoughts: createSetter("showThoughts"),
    };
  }, [provider, providerStateSetters]);
  const {
    setApiKey,
    setModel,
    setBaseUrl,
    setThinking,
    setTemperature,
    setShowThoughts,
  } = setters;
  const setProvider = useCallback((newProvider: Provider) => {
    setProviderState(newProvider);
  }, []);
  const hasApiKey = checkHasApiKey(provider);
  const isToolEnabled = useCallback(
    (toolId: string) => enabledTools[toolId] ?? true,
    [enabledTools],
  );
  const resetBehaviorToDefaults = useCallback(() => {
    setTemperature(1.0);
    setThinking(DEFAULT_SETTINGS[provider].thinking);
    setShowThoughts(true);
  }, [provider, setTemperature, setThinking, setShowThoughts]);
  const hasBaseUrl =
    provider === "custom" || provider === "lmstudio" || provider === "ollama";

  return {
    provider,
    setProvider,
    apiKey: currentSettings.apiKey,
    setApiKey,
    baseUrl: hasBaseUrl ? currentSettings.baseUrl : undefined,
    setBaseUrl: hasBaseUrl ? setBaseUrl : undefined,
    model: currentSettings.model,
    setModel,
    thinking: currentSettings.thinking,
    setThinking,
    temperature: currentSettings.temperature,
    setTemperature,
    showThoughts: currentSettings.showThoughts,
    setShowThoughts,
    saveSettings,
    cancelSettings,
    hasApiKey,
    settingsConfigured,
    enabledTools,
    setEnabledTools: setEnabledToolsState,
    resetBehaviorToDefaults,
    isToolEnabled,
  };
}
