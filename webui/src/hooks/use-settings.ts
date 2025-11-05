import { useCallback, useEffect, useState } from "preact/hooks";
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
    thinking: "Auto",
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
      return { ...DEFAULT_SETTINGS[provider], ...parsed };
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

export function useSettings(): UseSettingsReturn {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [settingsConfigured, setSettingsConfigured] = useState<boolean>(
    () => localStorage.getItem("producer_pal_settings_configured") === "true",
  );
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

  // Get the current provider's settings
  const currentSettings =
    provider === "gemini"
      ? geminiSettings
      : provider === "openai"
        ? openaiSettings
        : provider === "mistral"
          ? mistralSettings
          : provider === "openrouter"
            ? openrouterSettings
            : provider === "lmstudio"
              ? lmstudioSettings
              : provider === "ollama"
                ? ollamaSettings
                : customSettings;

  // Load settings from localStorage on mount
  useEffect(() => {
    // Load current provider
    const savedProvider =
      (localStorage.getItem(
        "producer_pal_current_provider",
      ) as Provider | null) ??
      (localStorage.getItem("provider") as Provider | null);
    if (savedProvider != null) {
      setProvider(savedProvider);
    }

    // Load settings for each provider
    setGeminiSettings(loadProviderSettings("gemini"));
    setOpenaiSettings(loadProviderSettings("openai"));
    setMistralSettings(loadProviderSettings("mistral"));
    setOpenrouterSettings(loadProviderSettings("openrouter"));
    setLmstudioSettings(loadProviderSettings("lmstudio"));
    setOllamaSettings(loadProviderSettings("ollama"));
    setCustomSettings(loadProviderSettings("custom"));
  }, []);

  const saveSettings = useCallback(() => {
    localStorage.setItem("producer_pal_current_provider", provider);
    localStorage.setItem("producer_pal_settings_configured", "true");
    setSettingsConfigured(true);
    saveProviderSettings("gemini", geminiSettings);
    saveProviderSettings("openai", openaiSettings);
    saveProviderSettings("mistral", mistralSettings);
    saveProviderSettings("openrouter", openrouterSettings);
    saveProviderSettings("lmstudio", lmstudioSettings);
    saveProviderSettings("ollama", ollamaSettings);
    saveProviderSettings("custom", customSettings);
  }, [
    provider,
    geminiSettings,
    openaiSettings,
    mistralSettings,
    openrouterSettings,
    lmstudioSettings,
    ollamaSettings,
    customSettings,
  ]);

  const cancelSettings = useCallback(() => {
    // Reload current provider
    const savedProvider =
      (localStorage.getItem(
        "producer_pal_current_provider",
      ) as Provider | null) ??
      (localStorage.getItem("provider") as Provider | null);
    if (savedProvider != null) setProvider(savedProvider);

    // Reload settings for each provider
    setGeminiSettings(loadProviderSettings("gemini"));
    setOpenaiSettings(loadProviderSettings("openai"));
    setMistralSettings(loadProviderSettings("mistral"));
    setOpenrouterSettings(loadProviderSettings("openrouter"));
    setLmstudioSettings(loadProviderSettings("lmstudio"));
    setOllamaSettings(loadProviderSettings("ollama"));
    setCustomSettings(loadProviderSettings("custom"));
  }, []);

  // Individual setters that update the current provider's settings
  const setApiKey = useCallback(
    (key: string) => {
      if (provider === "gemini") {
        setGeminiSettings((prev) => ({ ...prev, apiKey: key }));
      } else if (provider === "openai") {
        setOpenaiSettings((prev) => ({ ...prev, apiKey: key }));
      } else if (provider === "mistral") {
        setMistralSettings((prev) => ({ ...prev, apiKey: key }));
      } else if (provider === "openrouter") {
        setOpenrouterSettings((prev) => ({ ...prev, apiKey: key }));
      } else if (provider === "lmstudio") {
        setLmstudioSettings((prev) => ({ ...prev, apiKey: key }));
      } else if (provider === "ollama") {
        setOllamaSettings((prev) => ({ ...prev, apiKey: key }));
      } else {
        setCustomSettings((prev) => ({ ...prev, apiKey: key }));
      }
    },
    [provider],
  );

  const setModel = useCallback(
    (m: string) => {
      if (provider === "gemini") {
        setGeminiSettings((prev) => ({ ...prev, model: m }));
      } else if (provider === "openai") {
        setOpenaiSettings((prev) => ({ ...prev, model: m }));
      } else if (provider === "mistral") {
        setMistralSettings((prev) => ({ ...prev, model: m }));
      } else if (provider === "openrouter") {
        setOpenrouterSettings((prev) => ({ ...prev, model: m }));
      } else if (provider === "lmstudio") {
        setLmstudioSettings((prev) => ({ ...prev, model: m }));
      } else if (provider === "ollama") {
        setOllamaSettings((prev) => ({ ...prev, model: m }));
      } else {
        setCustomSettings((prev) => ({ ...prev, model: m }));
      }
    },
    [provider],
  );

  const setBaseUrl = useCallback(
    (url: string) => {
      if (provider === "custom") {
        setCustomSettings((prev) => ({ ...prev, baseUrl: url }));
      }
    },
    [provider],
  );

  const setPort = useCallback(
    (port: number) => {
      if (provider === "lmstudio") {
        setLmstudioSettings((prev) => ({ ...prev, port }));
      } else if (provider === "ollama") {
        setOllamaSettings((prev) => ({ ...prev, port }));
      }
    },
    [provider],
  );

  const setThinking = useCallback(
    (t: string) => {
      if (provider === "gemini") {
        setGeminiSettings((prev) => ({ ...prev, thinking: t }));
      } else if (provider === "openai") {
        setOpenaiSettings((prev) => ({ ...prev, thinking: t }));
      } else if (provider === "mistral") {
        setMistralSettings((prev) => ({ ...prev, thinking: t }));
      } else if (provider === "openrouter") {
        setOpenrouterSettings((prev) => ({ ...prev, thinking: t }));
      } else if (provider === "lmstudio") {
        setLmstudioSettings((prev) => ({ ...prev, thinking: t }));
      } else if (provider === "ollama") {
        setOllamaSettings((prev) => ({ ...prev, thinking: t }));
      } else {
        setCustomSettings((prev) => ({ ...prev, thinking: t }));
      }
    },
    [provider],
  );

  const setTemperature = useCallback(
    (temp: number) => {
      if (provider === "gemini") {
        setGeminiSettings((prev) => ({ ...prev, temperature: temp }));
      } else if (provider === "openai") {
        setOpenaiSettings((prev) => ({ ...prev, temperature: temp }));
      } else if (provider === "mistral") {
        setMistralSettings((prev) => ({ ...prev, temperature: temp }));
      } else if (provider === "openrouter") {
        setOpenrouterSettings((prev) => ({ ...prev, temperature: temp }));
      } else if (provider === "lmstudio") {
        setLmstudioSettings((prev) => ({ ...prev, temperature: temp }));
      } else if (provider === "ollama") {
        setOllamaSettings((prev) => ({ ...prev, temperature: temp }));
      } else {
        setCustomSettings((prev) => ({ ...prev, temperature: temp }));
      }
    },
    [provider],
  );

  const setShowThoughts = useCallback(
    (show: boolean) => {
      if (provider === "gemini") {
        setGeminiSettings((prev) => ({ ...prev, showThoughts: show }));
      } else if (provider === "openai") {
        setOpenaiSettings((prev) => ({ ...prev, showThoughts: show }));
      } else if (provider === "mistral") {
        setMistralSettings((prev) => ({ ...prev, showThoughts: show }));
      } else if (provider === "openrouter") {
        setOpenrouterSettings((prev) => ({ ...prev, showThoughts: show }));
      } else if (provider === "lmstudio") {
        setLmstudioSettings((prev) => ({ ...prev, showThoughts: show }));
      } else if (provider === "ollama") {
        setOllamaSettings((prev) => ({ ...prev, showThoughts: show }));
      } else {
        setCustomSettings((prev) => ({ ...prev, showThoughts: show }));
      }
    },
    [provider],
  );

  // Check if current provider has an API key saved
  // Local providers (lmstudio, ollama) don't require API keys
  const hasApiKey =
    provider === "lmstudio" || provider === "ollama"
      ? !!localStorage.getItem(`producer_pal_provider_${provider}`)
      : localStorage.getItem(`producer_pal_provider_${provider}`)
        ? (() => {
            try {
              const data = JSON.parse(
                localStorage.getItem(`producer_pal_provider_${provider}`) ??
                  "{}",
              );
              return !!data.apiKey;
            } catch {
              return false;
            }
          })()
        : provider === "gemini"
          ? !!localStorage.getItem("gemini_api_key")
          : false;

  return {
    provider,
    setProvider,
    apiKey: currentSettings.apiKey,
    setApiKey,
    baseUrl: provider === "custom" ? currentSettings.baseUrl : undefined,
    setBaseUrl: provider === "custom" ? setBaseUrl : undefined,
    port:
      provider === "lmstudio" || provider === "ollama"
        ? currentSettings.port
        : undefined,
    setPort:
      provider === "lmstudio" || provider === "ollama" ? setPort : undefined,
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
  };
}
