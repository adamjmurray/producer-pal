// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { THINKING_LEVELS } from "#webui/components/settings/controls/helpers/thinking-levels";
import { decryptApiKey, encryptApiKey } from "#webui/lib/api-key-crypto";
import {
  DEFAULT_MODELS,
  DEFAULT_REALTIME_VOICE,
  isValidGeminiRealtimeVoice,
  isValidRealtimeVoice,
} from "#webui/lib/constants/models";
import {
  DEFAULT_VOICE_LANGUAGE,
  isValidVoiceLanguage,
} from "#webui/lib/constants/voice-language";
import { type Provider } from "#webui/types/settings";

const REALTIME_VOICE_KEY = "producer_pal_realtime_voice";
const VOICE_SPEED_KEY = "producer_pal_voice_speed";
const VOICE_VOLUME_KEY = "producer_pal_voice_volume";
const VOICE_LANGUAGE_KEY = "producer_pal_voice_language";

export const VOICE_SPEED_MIN = 0.5;
export const VOICE_SPEED_MAX = 1.5;
export const VOICE_SPEED_DEFAULT = 1.0;

// Output playback gain (1.0 = unity). Driven through a Web Audio GainNode, which
// can boost above unity — so the range extends to 1.25 (125%). The plain
// <audio> element is muted and the remote stream is routed source → gain →
// destination; element .volume alone is hard-capped at 1.0 by the HTML spec.
export const VOICE_VOLUME_MIN = 0;
export const VOICE_VOLUME_MAX = 1.25;
export const VOICE_VOLUME_DEFAULT = 1.0;

/**
 * Loads the saved realtime voice from localStorage, falling back to the
 * default voice when missing or invalid. Accepts either an OpenAI or a Gemini
 * voice id (the two providers share this one field); the consuming hook
 * re-validates per active provider, so storing the other provider's voice here
 * is harmless and lets a chosen Gemini voice survive a reload.
 * @returns A known realtime voice id
 */
export function loadRealtimeVoice(): string {
  const stored = localStorage.getItem(REALTIME_VOICE_KEY);

  if (
    stored &&
    (isValidRealtimeVoice(stored) || isValidGeminiRealtimeVoice(stored))
  )
    return stored;

  return DEFAULT_REALTIME_VOICE;
}

/**
 * Persists the realtime voice selection to localStorage.
 * @param voice - The voice id to persist
 */
export function saveRealtimeVoice(voice: string): void {
  localStorage.setItem(REALTIME_VOICE_KEY, voice);
}

/**
 * Loads the saved voice playback speed multiplier from localStorage. Falls
 * back to 1.0 (normal speed) when missing or out of range.
 * @returns A speed multiplier clamped to [VOICE_SPEED_MIN, VOICE_SPEED_MAX]
 */
export function loadVoiceSpeed(): number {
  const stored = localStorage.getItem(VOICE_SPEED_KEY);

  if (stored == null) return VOICE_SPEED_DEFAULT;
  const parsed = Number.parseFloat(stored);

  if (!Number.isFinite(parsed)) return VOICE_SPEED_DEFAULT;

  return Math.min(VOICE_SPEED_MAX, Math.max(VOICE_SPEED_MIN, parsed));
}

/**
 * Persists the voice playback speed multiplier to localStorage.
 * @param speed - The speed multiplier to persist
 */
export function saveVoiceSpeed(speed: number): void {
  localStorage.setItem(VOICE_SPEED_KEY, String(speed));
}

/**
 * Loads the saved output playback volume from localStorage. Falls back to 1.0
 * (unity) when missing or out of range — existing users with no stored value
 * get unity.
 * @returns A volume clamped to [VOICE_VOLUME_MIN, VOICE_VOLUME_MAX]
 */
export function loadVoiceVolume(): number {
  const stored = localStorage.getItem(VOICE_VOLUME_KEY);

  if (stored == null) return VOICE_VOLUME_DEFAULT;
  const parsed = Number.parseFloat(stored);

  if (!Number.isFinite(parsed)) return VOICE_VOLUME_DEFAULT;

  return Math.min(VOICE_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, parsed));
}

/**
 * Persists the output playback volume to localStorage.
 * @param volume - The volume (0.0–1.25) to persist
 */
export function saveVoiceVolume(volume: number): void {
  localStorage.setItem(VOICE_VOLUME_KEY, String(volume));
}

/**
 * Loads the saved voice-chat language (ISO-639-1 code) from localStorage,
 * falling back to English when missing or unknown.
 * @returns A valid voice-language code
 */
export function loadVoiceLanguage(): string {
  const stored = localStorage.getItem(VOICE_LANGUAGE_KEY);

  if (stored && isValidVoiceLanguage(stored)) return stored;

  return DEFAULT_VOICE_LANGUAGE;
}

/**
 * Persists the voice-chat language selection to localStorage.
 * @param language - The ISO-639-1 language code to persist
 */
export function saveVoiceLanguage(language: string): void {
  localStorage.setItem(VOICE_LANGUAGE_KEY, language);
}

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

  if (apiKey) legacySettings.apiKey = apiKey;

  const model =
    localStorage.getItem("gemini_model") ?? localStorage.getItem("model");

  if (model) legacySettings.model = model;

  const thinking =
    localStorage.getItem("thinking") ?? localStorage.getItem("gemini_thinking");

  if (thinking) legacySettings.thinking = thinking;

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
 * Loads enabled tools from localStorage
 * @returns {Record<string, boolean>} - Tool enabled states
 */
export function loadEnabledTools(): Record<string, boolean> {
  const saved = localStorage.getItem("producer_pal_enabled_tools");

  if (saved) {
    try {
      return JSON.parse(saved) as Record<string, boolean>;
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Saves the current provider, enabled tools, and all provider settings to
 * localStorage. Provider settings (with encrypted apiKeys) are written
 * asynchronously; the rest are written synchronously up front.
 * @param {Provider} provider - Current provider
 * @param {Record<string, boolean>} enabledTools - Tool enabled states
 * @param {AllProviderSettings} allSettings - All provider settings
 * @returns {Promise<void>}
 */
export async function saveCurrentSettings(
  provider: Provider,
  enabledTools: Record<string, boolean>,
  allSettings: AllProviderSettings,
): Promise<void> {
  localStorage.setItem("producer_pal_current_provider", provider);
  localStorage.setItem("producer_pal_settings_configured", "true");
  localStorage.setItem(
    "producer_pal_enabled_tools",
    JSON.stringify(enabledTools),
  );
  await saveAllProviderSettings(allSettings);
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
 * Loads smallModelMode from localStorage
 * @returns {boolean} Whether small model mode is enabled
 */
export function loadSmallModelMode(): boolean {
  return localStorage.getItem("producer_pal_small_model_mode") === "true";
}

/**
 * Saves smallModelMode to localStorage
 * @param {boolean} enabled - Whether small model mode is enabled
 */
export function saveSmallModelMode(enabled: boolean): void {
  localStorage.setItem("producer_pal_small_model_mode", String(enabled));
}

const SUBAGENT_PRESET_KEY = "producer_pal_subagent_preset";

/**
 * Loads the "Subagent preset" id from localStorage — the preset a
 * spawned subagent runs under. Null (missing/blank) means "inherit current
 * settings", the shipped phase-1 behavior.
 * @returns {string | null} The saved preset id, or null to inherit
 */
export function loadSubagentPresetId(): string | null {
  // getItem already returns null when unset; saveSubagentPresetId never
  // stores an empty string, and the resolver/selector treat "" as inherit too.
  return localStorage.getItem(SUBAGENT_PRESET_KEY);
}

/**
 * Saves the "Subagent preset" id to localStorage. Null clears it back
 * to "inherit current settings".
 * @param {string | null} presetId - The preset id, or null to inherit
 */
export function saveSubagentPresetId(presetId: string | null): void {
  if (presetId) {
    localStorage.setItem(SUBAGENT_PRESET_KEY, presetId);
  } else {
    localStorage.removeItem(SUBAGENT_PRESET_KEY);
  }
}

/**
 * Type for setters that apply loaded settings to state
 * @returns {any} - Hook return value
 */
export type ProviderSettingsApplier = (settings: AllProviderSettings) => void;
