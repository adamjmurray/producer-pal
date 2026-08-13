// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";

/**
 * Model presets for each provider.
 * Convention: First item in each list is the default model for that provider.
 */

export type ModelKind = "realtime";

export interface ModelPresetItem {
  value: string;
  label: string;
  kind?: ModelKind;
}

export const OTHER_MODEL_OPTION = {
  value: "OTHER",
  label: "Other...",
} as const;

export const OPENAI_REALTIME_MODEL = "gpt-realtime-2.1";

/**
 * Gemini's recommended Live API model (audio-to-audio, low latency). Used as
 * the realtime fallback when the saved Gemini selection isn't itself a realtime
 * model, mirroring OPENAI_REALTIME_MODEL for the OpenAI side.
 */
export const GEMINI_REALTIME_MODEL = "gemini-3.1-flash-live-preview";

/**
 * Prebuilt voices for the Gemini Live API (distinct from OpenAI's
 * REALTIME_VOICES). The voice is set in the session config at connect time.
 * Labels include Google's tonal descriptor. All 30 are empirically verified to
 * produce audio on gemini-3.1-flash-live-preview; Puck is listed first as the
 * default. Source: Gemini TTS voice catalog (ai.google.dev).
 */
export const GEMINI_REALTIME_VOICES = [
  { value: "Puck", label: "Puck (Upbeat)" },
  { value: "Zephyr", label: "Zephyr (Bright)" },
  { value: "Charon", label: "Charon (Informative)" },
  { value: "Kore", label: "Kore (Firm)" },
  { value: "Fenrir", label: "Fenrir (Excitable)" },
  { value: "Leda", label: "Leda (Youthful)" },
  { value: "Orus", label: "Orus (Firm)" },
  { value: "Aoede", label: "Aoede (Breezy)" },
  { value: "Callirrhoe", label: "Callirrhoe (Easy-going)" },
  { value: "Autonoe", label: "Autonoe (Bright)" },
  { value: "Enceladus", label: "Enceladus (Breathy)" },
  { value: "Iapetus", label: "Iapetus (Clear)" },
  { value: "Umbriel", label: "Umbriel (Easy-going)" },
  { value: "Algieba", label: "Algieba (Smooth)" },
  { value: "Despina", label: "Despina (Smooth)" },
  { value: "Erinome", label: "Erinome (Clear)" },
  { value: "Algenib", label: "Algenib (Gravelly)" },
  { value: "Rasalgethi", label: "Rasalgethi (Informative)" },
  { value: "Laomedeia", label: "Laomedeia (Upbeat)" },
  { value: "Achernar", label: "Achernar (Soft)" },
  { value: "Alnilam", label: "Alnilam (Firm)" },
  { value: "Schedar", label: "Schedar (Even)" },
  { value: "Gacrux", label: "Gacrux (Mature)" },
  { value: "Pulcherrima", label: "Pulcherrima (Forward)" },
  { value: "Achird", label: "Achird (Friendly)" },
  { value: "Zubenelgenubi", label: "Zubenelgenubi (Casual)" },
  { value: "Vindemiatrix", label: "Vindemiatrix (Gentle)" },
  { value: "Sadachbia", label: "Sadachbia (Lively)" },
  { value: "Sadaltager", label: "Sadaltager (Knowledgeable)" },
  { value: "Sulafat", label: "Sulafat (Warm)" },
] as const;

export type GeminiRealtimeVoice =
  (typeof GEMINI_REALTIME_VOICES)[number]["value"];

export const DEFAULT_GEMINI_REALTIME_VOICE: GeminiRealtimeVoice = "Puck";

/**
 * Validates that a string is a known Gemini realtime voice id. Used when loading
 * a saved voice to guard against an OpenAI voice id (e.g. "marin") left over
 * from a provider switch.
 * @param value - Candidate voice id
 * @returns True if the value is one of GEMINI_REALTIME_VOICES
 */
export function isValidGeminiRealtimeVoice(
  value: string,
): value is GeminiRealtimeVoice {
  return GEMINI_REALTIME_VOICES.some((v) => v.value === value);
}

/**
 * Voice options accepted by OpenAI's Realtime API. Recommended by OpenAI:
 * `marin` or `cedar` for best audio quality. Once the model has emitted audio
 * in a session, the voice is locked for that session — we can change it
 * between sessions (Stop → Talk creates a fresh RealtimeAgent).
 */
export const REALTIME_VOICES = [
  { value: "marin", label: "Marin (recommended)" },
  { value: "cedar", label: "Cedar (recommended)" },
  { value: "alloy", label: "Alloy" },
  { value: "ash", label: "Ash" },
  { value: "ballad", label: "Ballad" },
  { value: "coral", label: "Coral" },
  { value: "echo", label: "Echo" },
  { value: "sage", label: "Sage" },
  { value: "shimmer", label: "Shimmer" },
  { value: "verse", label: "Verse" },
] as const;

export type RealtimeVoice = (typeof REALTIME_VOICES)[number]["value"];

export const DEFAULT_REALTIME_VOICE: RealtimeVoice = "marin";

/**
 * Validates that a string is a known realtime voice id. Used when loading
 * the saved voice from localStorage to guard against stale or hand-edited values.
 * @param value - Candidate voice id
 * @returns True if the value is one of REALTIME_VOICES
 */
export function isValidRealtimeVoice(value: string): value is RealtimeVoice {
  return REALTIME_VOICES.some((v) => v.value === value);
}

export const ANTHROPIC_MODELS = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { value: "claude-opus-5", label: "Claude Opus 5" },
  { value: "claude-fable-5", label: "Claude Fable 5" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  OTHER_MODEL_OPTION,
];

export const GEMINI_MODELS: ModelPresetItem[] = [
  { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
  {
    value: GEMINI_REALTIME_MODEL,
    label: "Gemini 3.1 Flash Live (Voice)",
    kind: "realtime",
  },
  OTHER_MODEL_OPTION,
];

export const OPENAI_MODELS: ModelPresetItem[] = [
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  {
    value: OPENAI_REALTIME_MODEL,
    label: "GPT Realtime 2.1 (Voice)",
    kind: "realtime",
  },
  OTHER_MODEL_OPTION,
];

export const MISTRAL_MODELS = [
  { value: "mistral-medium-latest", label: "Mistral Medium" },
  { value: "magistral-medium-2509", label: "Magistral Medium" },
  { value: "mistral-large-latest", label: "Mistral Large" },
  { value: "devstral-latest", label: "Devstral" },
  OTHER_MODEL_OPTION,
];

export const OPENROUTER_MODELS = [
  // Paid models
  {
    value: "google/gemini-3.7-flash",
    label: "[Paid] Google Gemini 3.7 Flash",
  },
  {
    value: "google/gemini-3.1-pro-preview",
    label: "[Paid] Google Gemini 3.1 Pro",
  },
  {
    value: "anthropic/claude-sonnet-5",
    label: "[Paid] Anthropic Claude Sonnet 5",
  },
  {
    value: "anthropic/claude-opus-5",
    label: "[Paid] Anthropic Claude Opus 5",
  },
  {
    value: "anthropic/claude-fable-5",
    label: "[Paid] Anthropic Claude Fable 5",
  },
  { value: "openai/gpt-5.6-terra", label: "[Paid] OpenAI GPT-5.6 Terra" },
  { value: "openai/gpt-5.6-sol", label: "[Paid] OpenAI GPT-5.6 Sol" },
  {
    value: "deepseek/deepseek-v4-flash-0731",
    label: "[Paid] DeepSeek V4 Flash",
  },
  { value: "mistralai/mistral-large-2512", label: "[Paid] Mistral Large" },
  { value: "moonshotai/kimi-k3", label: "[Paid] Moonshot AI Kimi K3" },
  { value: "z-ai/glm-5.2", label: "[Paid] Z.ai GLM 5.2" },
  { value: "qwen/qwen3.6-plus", label: "[Paid] Qwen 3.6 Plus" },
  { value: "qwen/qwen3.7-max", label: "[Paid] Qwen 3.7 Max" },
  // Free models
  {
    value: "google/gemma-4-31b-it:free",
    label: "[Free] Google Gemma 4 31B",
  },
  {
    value: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "[Free] Nvidia Nemotron 3 Super 120B",
  },
  {
    value: "poolside/laguna-xs-2.1:free",
    label: "[Free] Poolside Laguna XS 2.1",
  },
  {
    value: "cohere/north-mini-code:free",
    label: "[Free] Cohere North Mini Code",
  },
  OTHER_MODEL_OPTION,
];

export const OLLAMA_MODELS = [
  { value: "gemma4", label: "gemma4" },
  { value: "qwen3.6", label: "qwen3.6" },
  { value: "qwen3.5", label: "qwen3.5" },
  { value: "qwen3-coder", label: "qwen3-coder" },
  { value: "mistral", label: "mistral" },
  { value: "devstral-small-2", label: "devstral-small-2" },
  { value: "muse-glimmer:30b-mlx", label: "muse-glimmer:30b-mlx" },
  { value: "lfm2.5", label: "lfm2.5" },
  { value: "nemotron-cascade-2", label: "nemotron-cascade-2" },
  { value: "glm-4.7-flash", label: "glm-4.7-flash" },
  OTHER_MODEL_OPTION,
];

/**
 * Default model for each provider (first item in each list).
 * Used by settings initialization and E2E tests.
 */
export const DEFAULT_MODELS = {
  // First element always exists — cast to satisfy noUncheckedIndexedAccess
  anthropic: (ANTHROPIC_MODELS[0] as (typeof ANTHROPIC_MODELS)[0]).value,
  gemini: (GEMINI_MODELS[0] as (typeof GEMINI_MODELS)[0]).value,
  openai: (OPENAI_MODELS[0] as (typeof OPENAI_MODELS)[0]).value,
  mistral: (MISTRAL_MODELS[0] as (typeof MISTRAL_MODELS)[0]).value,
  openrouter: (OPENROUTER_MODELS[0] as (typeof OPENROUTER_MODELS)[0]).value,
  ollama: (OLLAMA_MODELS[0] as (typeof OLLAMA_MODELS)[0]).value,
  lmstudio: "",
  custom: "",
} as const;

/**
 * Model presets keyed by provider, used by the model selector and by voice
 * routing. `lmstudio` and `custom` are intentionally absent — they use
 * free-text model entry, so they have no presets (and thus no realtime model).
 */
export const PROVIDER_MODELS: Partial<
  Record<Provider, readonly ModelPresetItem[]>
> = {
  anthropic: ANTHROPIC_MODELS,
  gemini: GEMINI_MODELS,
  openai: OPENAI_MODELS,
  mistral: MISTRAL_MODELS,
  openrouter: OPENROUTER_MODELS,
  ollama: OLLAMA_MODELS,
};

const REALTIME_MODEL_ID = /realtime/i;
// Gemini's realtime/voice models don't carry "realtime" — they're named with
// "-live-" (gemini-3.1-flash-live-preview, gemini-2.0-flash-live-001) or
// "native-audio" (gemini-2.5-flash-native-audio-*). Deliberately excludes
// "realtime" so a foreign OpenAI id (gpt-realtime-2) under the gemini provider
// does NOT route to Gemini voice. Lets a free-text "Other..." Gemini live model
// enable voice without a preset for every id.
const GEMINI_REALTIME_MODEL_ID = /(-live-|native-audio)/i;

/**
 * Heuristic: does a model id name a realtime (voice) model? OpenAI's realtime
 * models all carry "realtime" in their id (gpt-realtime, gpt-realtime-2,
 * gpt-4o-realtime-preview, …). Lets a free-text "Other..." entry enable voice
 * without shipping a preset for every realtime model id.
 * @param model - Candidate model id
 * @returns True if the id looks like a realtime model
 */
export function isRealtimeModelId(model: string | null | undefined): boolean {
  return model != null && REALTIME_MODEL_ID.test(model);
}

/**
 * Heuristic counterpart to isRealtimeModelId for Gemini's naming (-live- /
 * native-audio / realtime). Lets a free-text "Other..." Gemini live model route
 * to voice.
 * @param model - Candidate model id
 * @returns True if the id looks like a Gemini realtime model
 */
export function isGeminiRealtimeModelId(
  model: string | null | undefined,
): boolean {
  return model != null && GEMINI_REALTIME_MODEL_ID.test(model);
}

/**
 * Returns true when the selected model is a realtime (voice) model under the
 * selected provider. A model qualifies as a realtime preset listed for the
 * provider, or as a free-text realtime id entered via "Other..." — the latter
 * only under the openai or gemini providers. Provider scoping is the point:
 * voice routes through OpenAI Realtime or Gemini Live (no key/transport
 * elsewhere), so a non-voice-capable endpoint reusing a realtime id routes to
 * text chat rather than a voice UI it can't drive.
 * @param provider - The selected provider
 * @param model - The selected model id
 * @returns True if the model is a realtime model for this provider
 */
export function isRealtimeSelection(
  provider: Provider,
  model: string | null | undefined,
): boolean {
  if (model == null) return false;

  const isPreset =
    PROVIDER_MODELS[provider]?.some(
      (m) => m.value === model && m.kind === "realtime",
    ) ?? false;

  return (
    isPreset ||
    (provider === "openai" && isRealtimeModelId(model)) ||
    (provider === "gemini" && isGeminiRealtimeModelId(model))
  );
}

/**
 * Resolve the realtime model id voice should run on: the saved selection when
 * it's a realtime model, else the default. Keeps the session, ephemeral token,
 * saved record, and header lock consistent when a non-default realtime model is
 * selected (instead of mislabeling everything as the default).
 * @param provider - The saved provider
 * @param model - The saved model id
 * @returns A realtime model id (never null)
 */
export function resolveRealtimeModel(
  provider: Provider,
  model: string | null | undefined,
): string {
  // isRealtimeSelection is false for null/undefined, so model is a string here.
  if (isRealtimeSelection(provider, model)) return model as string;

  return provider === "gemini" ? GEMINI_REALTIME_MODEL : OPENAI_REALTIME_MODEL;
}

/**
 * Which voice backend a (provider, model) realtime selection runs on. Returns
 * null when the selection isn't a realtime model at all. Lets the voice-mode
 * layer pick the OpenAI vs Gemini session hook without re-deriving the rule.
 * @param provider - The saved provider
 * @param model - The saved model id
 * @returns "openai" | "gemini" for a realtime selection, else null
 */
export function realtimeProvider(
  provider: Provider,
  model: string | null | undefined,
): "openai" | "gemini" | null {
  if (!isRealtimeSelection(provider, model)) return null;

  return provider === "gemini" ? "gemini" : "openai";
}
