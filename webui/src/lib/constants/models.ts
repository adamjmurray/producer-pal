// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Model presets for each provider.
 * Convention: First item in each list is the default model for that provider.
 */

export const OTHER_MODEL_OPTION = {
  value: "OTHER",
  label: "Other...",
} as const;

export const ANTHROPIC_MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  OTHER_MODEL_OPTION,
];

export const GEMINI_MODELS = [
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
  OTHER_MODEL_OPTION,
];

export const OPENAI_MODELS = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
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
  { value: "qwen/qwen3.6-plus", label: "[Paid] Qwen 3.6" },
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
