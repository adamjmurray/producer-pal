// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { THINKING_LEVELS } from "#webui/components/settings/controls/helpers/thinking-levels";
import { decryptApiKey, encryptApiKey } from "#webui/lib/api-key-crypto";
import { DEFAULT_MODELS } from "#webui/lib/constants/models";
import { type Provider } from "#webui/types/settings";

const VALID_THINKING_LEVELS: readonly string[] = THINKING_LEVELS;

export interface ProviderSettings {
  apiKey: string;
  model: string;
  baseUrl?: string;
  port?: number;
  thinking: string;
}

/**
 * Per-provider state setters, keyed by provider. Each accepts a functional
 * update over that provider's slice — so a caller can write into a provider's
 * slice regardless of which provider is currently active (used by applyPreset,
 * which targets the preset's own provider before switching to it).
 */
export type ProviderStateSetters = Record<
  Provider,
  (update: (prev: ProviderSettings) => ProviderSettings) => void
>;

export const DEFAULT_SETTINGS: Record<Provider, ProviderSettings> = {
  anthropic: {
    apiKey: "",
    model: DEFAULT_MODELS.anthropic,
    thinking: "Default",
  },
  gemini: {
    apiKey: "",
    model: DEFAULT_MODELS.gemini,
    thinking: "Default",
  },
  openai: {
    apiKey: "",
    model: DEFAULT_MODELS.openai,
    thinking: "Default",
  },
  mistral: {
    apiKey: "",
    model: DEFAULT_MODELS.mistral,
    thinking: "Default",
  },
  openrouter: {
    apiKey: "",
    model: DEFAULT_MODELS.openrouter,
    thinking: "Default",
  },
  lmstudio: {
    apiKey: "",
    model: DEFAULT_MODELS.lmstudio,
    baseUrl: "http://localhost:1234",
    thinking: "Default",
  },
  ollama: {
    apiKey: "",
    model: DEFAULT_MODELS.ollama,
    baseUrl: "http://localhost:11434",
    thinking: "Default",
  },
  custom: {
    apiKey: "",
    model: DEFAULT_MODELS.custom,
    baseUrl: "",
    thinking: "Default",
  },
};

// Every provider, derived from DEFAULT_SETTINGS so the list can't drift.
const PROVIDERS = Object.keys(DEFAULT_SETTINGS) as Provider[];

/**
 * Loads provider settings SYNCHRONOUSLY for state initialization. The apiKey is
 * a stored value (possibly an `enc:v1:` envelope) — to avoid flashing ciphertext
 * in React state, callers should treat this as a placeholder and apply the
 * decrypted key via {@link loadProviderSettingsAsync} a tick later.
 * @param {Provider} provider - Provider to load settings for
 * @returns {ProviderSettings} Settings with apiKey blanked (placeholder)
 */
export function loadProviderSettings(provider: Provider): ProviderSettings {
  const settings = readStoredProviderSettings(provider);

  // Blank the apiKey: the stored value may be an encrypted envelope, and
  // decryption is async. The real key is applied post-mount via the async load.
  return { ...settings, apiKey: "" };
}

/**
 * Loads provider settings and decrypts the apiKey. Use this for the post-mount
 * effect that applies the real key after the synchronous placeholder load.
 * @param {Provider} provider - Provider to load settings for
 * @returns {Promise<ProviderSettings>} Settings with the decrypted apiKey
 */
export async function loadProviderSettingsAsync(
  provider: Provider,
): Promise<ProviderSettings> {
  const settings = readStoredProviderSettings(provider);

  settings.apiKey = await decryptApiKey(settings.apiKey);

  return settings;
}

/**
 * Saves provider settings to localStorage, encrypting the apiKey at rest.
 * Saving is user-triggered, so this is awaited where possible but errors are
 * caught (never thrown into render).
 * @param {Provider} provider - Provider to save settings for
 * @param {ProviderSettings} settings - Settings to save (apiKey in cleartext)
 * @returns {Promise<void>}
 */
export async function saveProviderSettings(
  provider: Provider,
  settings: ProviderSettings,
): Promise<void> {
  const key = `producer_pal_provider_${provider}`;
  const encryptedApiKey = await encryptApiKey(settings.apiKey);

  localStorage.setItem(
    key,
    JSON.stringify({ ...settings, apiKey: encryptedApiKey }),
  );

  // Drop the pre-multi-provider plaintext Gemini key once the encrypted
  // envelope is in place, so the cleartext doesn't linger after migration.
  if (provider === "gemini") {
    localStorage.removeItem("gemini_api_key");
  }
}

/**
 * Reads raw provider settings from localStorage with backward compatibility.
 * The returned apiKey is the stored value verbatim (encrypted envelope or
 * legacy cleartext) — callers decide whether to decrypt or blank it.
 * @param {Provider} provider - Provider to read settings for
 * @returns {ProviderSettings} Settings with the stored (possibly encrypted) apiKey
 */
function readStoredProviderSettings(provider: Provider): ProviderSettings {
  const newFormatKey = `producer_pal_provider_${provider}`;
  const newFormatData = localStorage.getItem(newFormatKey);

  // Try new format first
  if (newFormatData) {
    try {
      const parsed = JSON.parse(newFormatData);

      // Migrate port to baseUrl for local providers
      if (parsed.port && !parsed.baseUrl) {
        parsed.baseUrl = `http://localhost:${parsed.port}/v1`;
      }

      const settings = { ...DEFAULT_SETTINGS[provider], ...parsed };

      if (!VALID_THINKING_LEVELS.includes(settings.thinking)) {
        settings.thinking = "Default";
      }

      return settings;
    } catch {
      // Invalid JSON, fall through to defaults or migration
    }
  }

  // Backward compatibility: only for Gemini provider
  if (provider === "gemini") {
    return readLegacyGeminiSettings();
  }

  // For non-Gemini providers, just use defaults
  return { ...DEFAULT_SETTINGS[provider] };
}

/**
 * Reads pre-multi-provider Gemini settings from their old localStorage keys.
 * @returns {ProviderSettings} Gemini settings merged over defaults
 */
function readLegacyGeminiSettings(): ProviderSettings {
  const legacySettings: Partial<ProviderSettings> = {};

  const apiKey = localStorage.getItem("gemini_api_key");

  if (apiKey) {
    legacySettings.apiKey = apiKey;
  }

  const model =
    localStorage.getItem("gemini_model") ?? localStorage.getItem("model");

  if (model) {
    legacySettings.model = model;
  }

  const thinking =
    localStorage.getItem("thinking") ?? localStorage.getItem("gemini_thinking");

  if (thinking) {
    legacySettings.thinking = thinking;
  }

  return { ...DEFAULT_SETTINGS.gemini, ...legacySettings };
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
  anthropic: ProviderSettings;
  gemini: ProviderSettings;
  openai: ProviderSettings;
  mistral: ProviderSettings;
  openrouter: ProviderSettings;
  lmstudio: ProviderSettings;
  ollama: ProviderSettings;
  custom: ProviderSettings;
}

/**
 * Loads settings for all providers with decrypted apiKeys.
 * @returns {Promise<AllProviderSettings>} All provider settings, keys decrypted
 */
export async function loadAllProviderSettingsAsync(): Promise<AllProviderSettings> {
  const entries = await Promise.all(
    PROVIDERS.map(
      async (p) => [p, await loadProviderSettingsAsync(p)] as const,
    ),
  );

  return Object.fromEntries(entries) as unknown as AllProviderSettings;
}

/**
 * Saves settings for all providers, encrypting each apiKey at rest.
 * @param {AllProviderSettings} settings - All provider settings to save
 * @returns {Promise<void>}
 */
export async function saveAllProviderSettings(
  settings: AllProviderSettings,
): Promise<void> {
  await Promise.all(PROVIDERS.map((p) => saveProviderSettings(p, settings[p])));
}

/**
 * Loads the current provider from localStorage, falling back to gemini for a
 * missing OR unrecognized value. A stale/renamed provider name (e.g. a provider
 * removed in a later release) must not survive: an unvalidated value flows
 * through to `currentSettings[provider]` → `undefined` → a `.apiKey` read that
 * crashes the app before the user can reach Settings to recover.
 * @returns {Provider} - A guaranteed-valid provider
 */
export function loadCurrentProvider(): Provider {
  const stored =
    localStorage.getItem("producer_pal_current_provider") ??
    localStorage.getItem("provider");

  return isValidProvider(stored) ? stored : "gemini";
}

/**
 * Type guard: is the value one of the known providers?
 * @param {unknown} value - Candidate provider value
 * @returns {boolean} - True if value is a recognized Provider
 */
export function isValidProvider(value: unknown): value is Provider {
  return typeof value === "string" && PROVIDERS.includes(value as Provider);
}

/**
 * Gets the current settings for all providers from state
 * @param {ProviderSettings} anthropic - Anthropic settings
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
  anthropic: ProviderSettings,
  gemini: ProviderSettings,
  openai: ProviderSettings,
  mistral: ProviderSettings,
  openrouter: ProviderSettings,
  lmstudio: ProviderSettings,
  ollama: ProviderSettings,
  custom: ProviderSettings,
): AllProviderSettings {
  return {
    anthropic,
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
