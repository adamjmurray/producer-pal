import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { Provider, UseSettingsReturn } from "../types/settings.js";
import {
  checkHasApiKey,
  createAllToolsDisabled,
  createAllToolsEnabled,
  DEFAULT_SETTINGS,
  loadAllProviderSettings,
  loadCurrentProvider,
  loadEnabledTools,
  normalizeThinkingForOpenAI,
  type ProviderSettings,
  saveAllProviderSettings,
} from "./settings-helpers.js";

type ProviderStateSetters = Record<
  Provider,
  (update: (prev: ProviderSettings) => ProviderSettings) => void
>;

function createProviderSetter<K extends keyof ProviderSettings>(
  provider: Provider,
  setters: ProviderStateSetters,
  key: K,
) {
  return (value: ProviderSettings[K]) => {
    setters[provider]((prev) => ({ ...prev, [key]: value }));
  };
}

export function useSettings(): UseSettingsReturn {
  const [provider, setProviderState] = useState<Provider>(loadCurrentProvider);
  const [settingsConfigured, setSettingsConfigured] = useState<boolean>(
    () => localStorage.getItem("producer_pal_settings_configured") === "true",
  );
  const [enabledTools, setEnabledToolsState] =
    useState<Record<string, boolean>>(loadEnabledTools);
  const [geminiSettings, setGeminiSettings] = useState<ProviderSettings>(
    DEFAULT_SETTINGS.gemini,
  );
  const [openaiSettings, setOpenaiSettings] = useState<ProviderSettings>(
    DEFAULT_SETTINGS.openai,
  );
  const [mistralSettings, setMistralSettings] = useState<ProviderSettings>(
    DEFAULT_SETTINGS.mistral,
  );
  const [openrouterSettings, setOpenrouterSettings] =
    useState<ProviderSettings>(DEFAULT_SETTINGS.openrouter);
  const [lmstudioSettings, setLmstudioSettings] = useState<ProviderSettings>(
    DEFAULT_SETTINGS.lmstudio,
  );
  const [ollamaSettings, setOllamaSettings] = useState<ProviderSettings>(
    DEFAULT_SETTINGS.ollama,
  );
  const [customSettings, setCustomSettings] = useState<ProviderSettings>(
    DEFAULT_SETTINGS.custom,
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

  useEffect(() => {
    const allSettings = loadAllProviderSettings();
    setGeminiSettings(allSettings.gemini);
    setOpenaiSettings(allSettings.openai);
    setMistralSettings(allSettings.mistral);
    setOpenrouterSettings(allSettings.openrouter);
    setLmstudioSettings(allSettings.lmstudio);
    setOllamaSettings(allSettings.ollama);
    setCustomSettings(allSettings.custom);
  }, []);

  const saveSettings = useCallback(() => {
    localStorage.setItem("producer_pal_current_provider", provider);
    localStorage.setItem("producer_pal_settings_configured", "true");
    setSettingsConfigured(true);
    localStorage.setItem(
      "producer_pal_enabled_tools",
      JSON.stringify(enabledTools),
    );
    saveAllProviderSettings({
      gemini: geminiSettings,
      openai: openaiSettings,
      mistral: mistralSettings,
      openrouter: openrouterSettings,
      lmstudio: lmstudioSettings,
      ollama: ollamaSettings,
      custom: customSettings,
    });
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
    const allSettings = loadAllProviderSettings();
    setGeminiSettings(allSettings.gemini);
    setOpenaiSettings(allSettings.openai);
    setMistralSettings(allSettings.mistral);
    setOpenrouterSettings(allSettings.openrouter);
    setLmstudioSettings(allSettings.lmstudio);
    setOllamaSettings(allSettings.ollama);
    setCustomSettings(allSettings.custom);
  }, []);

  // Individual setters that update the current provider's settings
  const setApiKey = useCallback(
    (key: string) =>
      createProviderSetter(provider, providerStateSetters, "apiKey")(key),
    [provider, providerStateSetters],
  );

  const setModel = useCallback(
    (m: string) =>
      createProviderSetter(provider, providerStateSetters, "model")(m),
    [provider, providerStateSetters],
  );

  const setBaseUrl = useCallback(
    (url: string) =>
      provider === "custom"
        ? createProviderSetter(provider, providerStateSetters, "baseUrl")(url)
        : undefined,
    [provider, providerStateSetters],
  );

  const setPort = useCallback(
    (port: number) =>
      provider === "lmstudio" || provider === "ollama"
        ? createProviderSetter(provider, providerStateSetters, "port")(port)
        : undefined,
    [provider, providerStateSetters],
  );

  const setThinking = useCallback(
    (t: string) =>
      createProviderSetter(provider, providerStateSetters, "thinking")(t),
    [provider, providerStateSetters],
  );

  const setTemperature = useCallback(
    (temp: number) =>
      createProviderSetter(provider, providerStateSetters, "temperature")(temp),
    [provider, providerStateSetters],
  );

  const setShowThoughts = useCallback(
    (show: boolean) =>
      createProviderSetter(
        provider,
        providerStateSetters,
        "showThoughts",
      )(show),
    [provider, providerStateSetters],
  );

  // Custom setProvider that normalizes thinking value when switching providers
  const setProvider = useCallback(
    (newProvider: Provider) => {
      // If switching to OpenAI, normalize the thinking value
      if (newProvider === "openai") {
        const normalized = normalizeThinkingForOpenAI(currentSettings.thinking);
        if (normalized !== currentSettings.thinking) {
          // Update OpenAI settings with normalized thinking value
          setOpenaiSettings((prev) => ({ ...prev, thinking: normalized }));
        }
      }
      setProviderState(newProvider);
    },
    [currentSettings.thinking],
  );

  // Check if current provider has an API key saved
  const hasApiKey = checkHasApiKey(provider);

  const enableAllTools = useCallback(() => {
    setEnabledToolsState(createAllToolsEnabled());
  }, []);

  const disableAllTools = useCallback(() => {
    setEnabledToolsState(createAllToolsDisabled());
  }, []);

  const resetBehaviorToDefaults = useCallback(() => {
    setTemperature(1.0);
    setThinking(DEFAULT_SETTINGS[provider].thinking);
    setShowThoughts(true);
  }, [provider, setTemperature, setThinking, setShowThoughts]);

  const isToolEnabled = useCallback(
    (toolId: string) => enabledTools[toolId] ?? true,
    [enabledTools],
  );

  const isCustom = provider === "custom";
  const isLocal = provider === "lmstudio" || provider === "ollama";

  return {
    provider,
    setProvider,
    apiKey: currentSettings.apiKey,
    setApiKey,
    baseUrl: isCustom ? currentSettings.baseUrl : undefined,
    setBaseUrl: isCustom ? setBaseUrl : undefined,
    port: isLocal ? currentSettings.port : undefined,
    setPort: isLocal ? setPort : undefined,
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
    enableAllTools,
    disableAllTools,
    resetBehaviorToDefaults,
    isToolEnabled,
  };
}
