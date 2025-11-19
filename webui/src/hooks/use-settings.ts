import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { DEFAULT_ENABLED_TOOLS, TOOLS } from "../constants/tools.js";
import type { Provider, UseSettingsReturn } from "../types/settings.js";

interface ProviderSettings {
  apiKey: string;
  model: string;
  baseUrl?: string;
  port?: number;
  thinking: string;
  temperature: number;
  showThoughts: boolean;
}

const DEFAULT_SETTINGS: Record<Provider, ProviderSettings> = {
  gemini: {
    apiKey: "",
    model: "gemini-2.5-flash",
    thinking: "Auto",
    temperature: 1.0,
    showThoughts: true,
  },
  openai: {
    apiKey: "",
    model: "gpt-5-2025-08-07",
    thinking: "Medium",
    temperature: 1.0,
    showThoughts: true,
  },
  mistral: {
    apiKey: "",
    model: "mistral-medium-latest",
    thinking: "Auto",
    temperature: 1.0,
    showThoughts: true,
  },
  openrouter: {
    apiKey: "",
    model: "minimax/minimax-m2:free",
    thinking: "Auto",
    temperature: 1.0,
    showThoughts: true,
  },
  lmstudio: {
    apiKey: "",
    model: "",
    port: 1234,
    thinking: "Auto",
    temperature: 1.0,
    showThoughts: true,
  },
  ollama: {
    apiKey: "",
    model: "",
    port: 11434,
    thinking: "Auto",
    temperature: 1.0,
    showThoughts: true,
  },
  custom: {
    apiKey: "",
    model: "",
    baseUrl: "",
    thinking: "Auto",
    temperature: 1.0,
    showThoughts: true,
  },
};

function loadProviderSettings(provider: Provider): ProviderSettings {
  const newFormatKey = `producer_pal_provider_${provider}`;
  const newFormatData = localStorage.getItem(newFormatKey);

  // Try new format first
  if (newFormatData) {
    try {
      const parsed = JSON.parse(newFormatData);
      const settings = { ...DEFAULT_SETTINGS[provider], ...parsed };

      // Normalize thinking value for OpenAI if it's invalid
      if (provider === "openai") {
        settings.thinking = normalizeThinkingForOpenAI(settings.thinking);
      }

      return settings;
    } catch {
      // Invalid JSON, fall through to defaults or migration
    }
  }

  // Backward compatibility: only for Gemini provider
  if (provider === "gemini") {
    const legacySettings: Partial<ProviderSettings> = {};

    const apiKey = localStorage.getItem("gemini_api_key");
    if (apiKey) legacySettings.apiKey = apiKey;

    const model =
      localStorage.getItem("gemini_model") ?? localStorage.getItem("model");
    if (model) legacySettings.model = model;

    const thinking =
      localStorage.getItem("thinking") ??
      localStorage.getItem("gemini_thinking");
    if (thinking) legacySettings.thinking = thinking;

    const temperature =
      localStorage.getItem("temperature") ??
      localStorage.getItem("gemini_temperature");
    if (temperature != null) {
      legacySettings.temperature = parseFloat(temperature);
    }

    const showThoughts =
      localStorage.getItem("showThoughts") ??
      localStorage.getItem("gemini_showThoughts");
    if (showThoughts != null) {
      legacySettings.showThoughts = showThoughts === "true";
    }

    return { ...DEFAULT_SETTINGS.gemini, ...legacySettings };
  }

  // For non-Gemini providers, just use defaults
  return DEFAULT_SETTINGS[provider];
}

function saveProviderSettings(provider: Provider, settings: ProviderSettings) {
  const key = `producer_pal_provider_${provider}`;
  localStorage.setItem(key, JSON.stringify(settings));
}

function normalizeThinkingForOpenAI(thinking: string): string {
  // OpenAI only supports "Low", "Medium", "High"
  if (thinking === "Off" || thinking === "Auto") {
    return "Low";
  }
  if (thinking === "Ultra") {
    return "High";
  }
  return thinking;
}

function checkHasApiKey(provider: Provider): boolean {
  if (provider === "lmstudio" || provider === "ollama") {
    return Boolean(localStorage.getItem(`producer_pal_provider_${provider}`));
  }

  const savedData = localStorage.getItem(`producer_pal_provider_${provider}`);
  if (savedData) {
    try {
      const data = JSON.parse(savedData);
      return Boolean(data.apiKey);
    } catch {
      return false;
    }
  }

  // Legacy Gemini API key check
  if (provider === "gemini") {
    return Boolean(localStorage.getItem("gemini_api_key"));
  }

  return false;
}

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

interface AllProviderSettings {
  gemini: ProviderSettings;
  openai: ProviderSettings;
  mistral: ProviderSettings;
  openrouter: ProviderSettings;
  lmstudio: ProviderSettings;
  ollama: ProviderSettings;
  custom: ProviderSettings;
}

function loadAllProviderSettings(): AllProviderSettings {
  return {
    gemini: loadProviderSettings("gemini"),
    openai: loadProviderSettings("openai"),
    mistral: loadProviderSettings("mistral"),
    openrouter: loadProviderSettings("openrouter"),
    lmstudio: loadProviderSettings("lmstudio"),
    ollama: loadProviderSettings("ollama"),
    custom: loadProviderSettings("custom"),
  };
}

function saveAllProviderSettings(settings: AllProviderSettings) {
  saveProviderSettings("gemini", settings.gemini);
  saveProviderSettings("openai", settings.openai);
  saveProviderSettings("mistral", settings.mistral);
  saveProviderSettings("openrouter", settings.openrouter);
  saveProviderSettings("lmstudio", settings.lmstudio);
  saveProviderSettings("ollama", settings.ollama);
  saveProviderSettings("custom", settings.custom);
}

function loadCurrentProvider(): Provider {
  return (
    (localStorage.getItem(
      "producer_pal_current_provider",
    ) as Provider | null) ??
    (localStorage.getItem("provider") as Provider | null) ??
    "gemini"
  );
}

function loadEnabledTools(): Record<string, boolean> {
  const saved = localStorage.getItem("producer_pal_enabled_tools");
  if (saved) {
    try {
      return { ...DEFAULT_ENABLED_TOOLS, ...JSON.parse(saved) };
    } catch {
      return DEFAULT_ENABLED_TOOLS;
    }
  }
  return DEFAULT_ENABLED_TOOLS;
}

function createAllToolsEnabled(): Record<string, boolean> {
  return TOOLS.reduce(
    (acc, tool) => {
      acc[tool.id] = true;
      return acc;
    },
    {} as Record<string, boolean>,
  );
}

function createAllToolsDisabled(): Record<string, boolean> {
  return TOOLS.reduce(
    (acc, tool) => {
      acc[tool.id] = false;
      return acc;
    },
    {} as Record<string, boolean>,
  );
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
