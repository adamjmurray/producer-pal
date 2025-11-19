import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { Provider, UseSettingsReturn } from "../types/settings.js";
import {
  buildAllProviderSettings,
  checkHasApiKey,
  createAllToolsDisabled,
  createAllToolsEnabled,
  DEFAULT_SETTINGS,
  loadAllProviderSettings,
  loadCurrentProvider,
  loadEnabledTools,
  normalizeThinkingForOpenAI,
  type ProviderSettings,
  saveCurrentSettings,
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

// Hook manages state for 7 providers with individual setters and orchestration logic
// eslint-disable-next-line max-lines-per-function
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

    return {
      setApiKey: createSetter("apiKey"),
      setModel: createSetter("model"),
      setBaseUrl:
        provider === "custom"
          ? createSetter("baseUrl")
          : (_url: string) => undefined,
      setPort:
        provider === "lmstudio" || provider === "ollama"
          ? createSetter("port")
          : (_port: number) => undefined,
      setThinking: createSetter("thinking"),
      setTemperature: createSetter("temperature"),
      setShowThoughts: createSetter("showThoughts"),
    };
  }, [provider, providerStateSetters]);
  const {
    setApiKey,
    setModel,
    setBaseUrl,
    setPort,
    setThinking,
    setTemperature,
    setShowThoughts,
  } = setters;
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
  const hasApiKey = checkHasApiKey(provider);
  const toolsUtils = useMemo(
    () => ({
      enableAll: () => setEnabledToolsState(createAllToolsEnabled()),
      disableAll: () => setEnabledToolsState(createAllToolsDisabled()),
      isEnabled: (toolId: string) => enabledTools[toolId] ?? true,
    }),
    [enabledTools],
  );
  const resetBehaviorToDefaults = useCallback(() => {
    setTemperature(1.0);
    setThinking(DEFAULT_SETTINGS[provider].thinking);
    setShowThoughts(true);
  }, [provider, setTemperature, setThinking, setShowThoughts]);
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
    enableAllTools: toolsUtils.enableAll,
    disableAllTools: toolsUtils.disableAll,
    resetBehaviorToDefaults,
    isToolEnabled: toolsUtils.isEnabled,
  };
}
