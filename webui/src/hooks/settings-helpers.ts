import type { Provider } from "../types/settings.js";
import { DEFAULT_ENABLED_TOOLS, TOOLS } from "../constants/tools.js";

export interface ProviderSettings {
  apiKey: string;
  model: string;
  baseUrl?: string;
  port?: number;
  thinking: string;
  temperature: number;
  showThoughts: boolean;
}

export const DEFAULT_SETTINGS: Record<Provider, ProviderSettings> = {
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

/**
 *
 * @param provider
 */
export function loadProviderSettings(provider: Provider): ProviderSettings {
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

/**
 *
 * @param provider
 * @param settings
 */
export function saveProviderSettings(
  provider: Provider,
  settings: ProviderSettings,
) {
  const key = `producer_pal_provider_${provider}`;
  localStorage.setItem(key, JSON.stringify(settings));
}

/**
 *
 * @param thinking
 */
export function normalizeThinkingForOpenAI(thinking: string): string {
  // OpenAI only supports "Low", "Medium", "High"
  if (thinking === "Off" || thinking === "Auto") {
    return "Low";
  }
  if (thinking === "Ultra") {
    return "High";
  }
  return thinking;
}

/**
 *
 * @param provider
 */
export function checkHasApiKey(provider: Provider): boolean {
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

export interface AllProviderSettings {
  gemini: ProviderSettings;
  openai: ProviderSettings;
  mistral: ProviderSettings;
  openrouter: ProviderSettings;
  lmstudio: ProviderSettings;
  ollama: ProviderSettings;
  custom: ProviderSettings;
}

/**
 *
 */
export function loadAllProviderSettings(): AllProviderSettings {
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

/**
 *
 * @param settings
 */
export function saveAllProviderSettings(settings: AllProviderSettings) {
  saveProviderSettings("gemini", settings.gemini);
  saveProviderSettings("openai", settings.openai);
  saveProviderSettings("mistral", settings.mistral);
  saveProviderSettings("openrouter", settings.openrouter);
  saveProviderSettings("lmstudio", settings.lmstudio);
  saveProviderSettings("ollama", settings.ollama);
  saveProviderSettings("custom", settings.custom);
}

/**
 *
 */
export function loadCurrentProvider(): Provider {
  return (
    (localStorage.getItem(
      "producer_pal_current_provider",
    ) as Provider | null) ??
    (localStorage.getItem("provider") as Provider | null) ??
    "gemini"
  );
}

/**
 *
 */
export function loadEnabledTools(): Record<string, boolean> {
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

/**
 *
 */
export function createAllToolsEnabled(): Record<string, boolean> {
  return TOOLS.reduce(
    (acc, tool) => {
      acc[tool.id] = true;
      return acc;
    },
    {} as Record<string, boolean>,
  );
}

/**
 *
 */
export function createAllToolsDisabled(): Record<string, boolean> {
  return TOOLS.reduce(
    (acc, tool) => {
      acc[tool.id] = false;
      return acc;
    },
    {} as Record<string, boolean>,
  );
}

/**
 * Saves the current provider, enabled tools, and all provider settings to localStorage
 * @param provider
 * @param enabledTools
 * @param allSettings
 */
export function saveCurrentSettings(
  provider: Provider,
  enabledTools: Record<string, boolean>,
  allSettings: AllProviderSettings,
): void {
  localStorage.setItem("producer_pal_current_provider", provider);
  localStorage.setItem("producer_pal_settings_configured", "true");
  localStorage.setItem(
    "producer_pal_enabled_tools",
    JSON.stringify(enabledTools),
  );
  saveAllProviderSettings(allSettings);
}

/**
 * Gets the current settings for all providers from state
 * @param gemini
 * @param openai
 * @param mistral
 * @param openrouter
 * @param lmstudio
 * @param ollama
 * @param custom
 */
export function buildAllProviderSettings(
  gemini: ProviderSettings,
  openai: ProviderSettings,
  mistral: ProviderSettings,
  openrouter: ProviderSettings,
  lmstudio: ProviderSettings,
  ollama: ProviderSettings,
  custom: ProviderSettings,
): AllProviderSettings {
  return {
    gemini,
    openai,
    mistral,
    openrouter,
    lmstudio,
    ollama,
    custom,
  };
}

/**
 * Type for setters that apply loaded settings to state
 */
export type ProviderSettingsApplier = (settings: AllProviderSettings) => void;
