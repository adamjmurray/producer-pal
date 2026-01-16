import { DEFAULT_MODELS } from "#webui/lib/constants/models";
import { DEFAULT_ENABLED_TOOLS, TOOLS } from "#webui/lib/constants/tools";
import type { Provider } from "#webui/types/settings";

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
    model: DEFAULT_MODELS.gemini,
    thinking: "Default",
    temperature: 1.0,
    showThoughts: true,
  },
  openai: {
    apiKey: "",
    model: DEFAULT_MODELS.openai,
    thinking: "Default",
    temperature: 1.0,
    showThoughts: true,
  },
  mistral: {
    apiKey: "",
    model: DEFAULT_MODELS.mistral,
    thinking: "Default",
    temperature: 1.0,
    showThoughts: true,
  },
  openrouter: {
    apiKey: "",
    model: DEFAULT_MODELS.openrouter,
    thinking: "Default",
    temperature: 1.0,
    showThoughts: true,
  },
  lmstudio: {
    apiKey: "",
    model: DEFAULT_MODELS.lmstudio,
    port: 1234,
    thinking: "Default",
    temperature: 1.0,
    showThoughts: true,
  },
  ollama: {
    apiKey: "",
    model: DEFAULT_MODELS.ollama,
    port: 11434,
    thinking: "Default",
    temperature: 1.0,
    showThoughts: true,
  },
  custom: {
    apiKey: "",
    model: DEFAULT_MODELS.custom,
    baseUrl: "",
    thinking: "Default",
    temperature: 1.0,
    showThoughts: true,
  },
};

/**
 * Loads provider settings from localStorage with backward compatibility
 * @param {Provider} provider - Provider to load settings for
 * @returns {any} - Hook return value
 */
export function loadProviderSettings(provider: Provider): ProviderSettings {
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
      legacySettings.temperature = Number.parseFloat(temperature);
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
 * Saves provider settings to localStorage
 * @param {Provider} provider - Provider to save settings for
 * @param {ProviderSettings} settings - Settings to save
 * @returns {any} - Hook return value
 */
export function saveProviderSettings(
  provider: Provider,
  settings: ProviderSettings,
) {
  const key = `producer_pal_provider_${provider}`;

  localStorage.setItem(key, JSON.stringify(settings));
}

/**
 * Checks if provider has an API key configured
 * @param {Provider} provider - Provider to check
 * @returns {any} - Hook return value
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
 * Loads settings for all providers
 * @returns {any} - Hook return value
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
 * Saves settings for all providers
 * @param {AllProviderSettings} settings - All provider settings to save
 * @returns {any} - Hook return value
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
 * Loads the current provider from localStorage
 * @returns {any} - Hook return value
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
 * Loads enabled tools from localStorage
 * @returns {any} - Hook return value
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
 * Creates record with all tools enabled
 * @returns {any} - Hook return value
 */
export function createAllToolsEnabled(): Record<string, boolean> {
  return TOOLS.reduce<Record<string, boolean>>((acc, tool) => {
    acc[tool.id] = true;

    return acc;
  }, {});
}

/**
 * Creates record with all tools disabled
 * @returns {any} - Hook return value
 */
export function createAllToolsDisabled(): Record<string, boolean> {
  return TOOLS.reduce<Record<string, boolean>>((acc, tool) => {
    acc[tool.id] = false;

    return acc;
  }, {});
}

/**
 * Saves the current provider, enabled tools, and all provider settings to localStorage
 * @param {Provider} provider - Current provider
 * @param {Record<string, boolean>} enabledTools - Tool enabled states
 * @param {AllProviderSettings} allSettings - All provider settings
 * @returns {any} - Hook return value
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
 * @param {ProviderSettings} gemini - Gemini settings
 * @param {ProviderSettings} openai - OpenAI settings
 * @param {ProviderSettings} mistral - Mistral settings
 * @param {ProviderSettings} openrouter - OpenRouter settings
 * @param {ProviderSettings} lmstudio - LM Studio settings
 * @param {ProviderSettings} ollama - Ollama settings
 * @param {ProviderSettings} custom - Custom provider settings
 * @returns {any} - Hook return value
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
 * @returns {any} - Hook return value
 */
export type ProviderSettingsApplier = (settings: AllProviderSettings) => void;
