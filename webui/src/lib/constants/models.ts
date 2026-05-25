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

export const OPENAI_REALTIME_MODEL = "gpt-realtime-2";

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
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  OTHER_MODEL_OPTION,
];

export const GEMINI_MODELS = [
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
  OTHER_MODEL_OPTION,
];

export const OPENAI_MODELS: ModelPresetItem[] = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  {
    value: OPENAI_REALTIME_MODEL,
    label: "GPT Realtime 2 (Voice)",
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
    value: "google/gemini-3-flash-preview",
    label: "[Paid] Google Gemini 3 Flash",
  },
  {
    value: "google/gemini-3.1-pro-preview",
    label: "[Paid] Google Gemini 3.1 Pro",
  },
  {
    value: "anthropic/claude-sonnet-4.6",
    label: "[Paid] Anthropic Claude Sonnet 4.6",
  },
  {
    value: "anthropic/claude-opus-4.7",
    label: "[Paid] Anthropic Claude Opus 4.7",
  },
  { value: "openai/gpt-5.5", label: "[Paid] OpenAI GPT-5.5" },
  {
    value: "openai/gpt-5.3-codex",
    label: "[Paid] OpenAI GPT-5.3 Codex",
  },
  { value: "mistralai/mistral-large-2512", label: "[Paid] Mistral Large" },
  { value: "qwen/qwen3.6-plus", label: "[Paid] Qwen 3.6 Plus" },
  { value: "moonshotai/kimi-k2.6", label: "[Paid] Moonshot AI Kimi K2.6" },
  // Free models
  { value: "z-ai/glm-4.5-air:free", label: "[Free] Z.AI GLM 4.5 Air" },
  { value: "qwen/qwen3-coder:free", label: "[Free] Qwen3 Coder 480B" },
  {
    value: "arcee-ai/trinity-large-preview:free",
    label: "[Free] Arcee Trinity Large",
  },
  {
    value: "nvidia/nemotron-3-nano-30b-a3b:free",
    label: "[Free] Nvidia Nemotron 3 Nano",
  },
  OTHER_MODEL_OPTION,
];

export const OLLAMA_MODELS = [
  { value: "gemma4", label: "gemma4" },
  { value: "qwen3.6", label: "qwen3.6" },
  { value: "qwen3-coder", label: "qwen3-coder" },
  { value: "mistral", label: "mistral" },
  { value: "devstral-small-2", label: "devstral-small-2" },
  { value: "nemotron-cascade-2", label: "nemotron-cascade-2" },
  { value: "glm-4.7-flash", label: "glm-4.7-flash" },
  { value: "lfm2", label: "lfm2" },
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

/**
 * Returns true when the selected model is a realtime (voice) model that belongs
 * to the selected provider. Provider scoping is the point: a realtime model id
 * is only valid for the provider listing it, so a non-matching provider (e.g. a
 * custom OpenAI-compatible endpoint reusing the id) routes to text chat rather
 * than a voice UI it has no key/transport for.
 * @param provider - The selected provider
 * @param model - The selected model id
 * @returns True if the model is a realtime model for this provider
 */
export function isRealtimeSelection(
  provider: Provider,
  model: string | null | undefined,
): boolean {
  if (model == null) return false;

  return (
    PROVIDER_MODELS[provider]?.some(
      (m) => m.value === model && m.kind === "realtime",
    ) ?? false
  );
}
