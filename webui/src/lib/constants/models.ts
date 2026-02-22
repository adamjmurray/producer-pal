// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Model presets for each provider.
 * Convention: First item in each list is the default model for that provider.
 */

export const GEMINI_MODELS = [
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "OTHER", label: "Other..." },
];

export const OPENAI_MODELS = [
  { value: "gpt-5.2", label: "GPT-5.2" },
  { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  { value: "gpt-5", label: "GPT-5" },
  { value: "gpt-5-mini", label: "GPT-5 Mini" },
  { value: "OTHER", label: "Other..." },
];

export const MISTRAL_MODELS = [
  { value: "devstral-latest", label: "Devstral" },
  { value: "mistral-large-latest", label: "Mistral Large" },
  { value: "mistral-medium-latest", label: "Mistral Medium" },
  { value: "mistral-small-latest", label: "Mistral Small" },
  { value: "OTHER", label: "Other..." },
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
    value: "anthropic/claude-opus-4.6",
    label: "[Paid] Anthropic Claude Opus 4.6",
  },
  { value: "openai/gpt-5.2", label: "[Paid] OpenAI GPT-5.2" },
  {
    value: "openai/gpt-5.2-codex",
    label: "[Paid] OpenAI GPT-5.2 Codex",
  },
  { value: "x-ai/grok-4.1-fast", label: "[Paid] xAI Grok 4.1 Fast" },
  { value: "mistralai/mistral-large-2512", label: "[Paid] Mistral Large" },
  { value: "qwen/qwen3.5-397b-a17b", label: "[Paid] Qwen 3.5" },
  { value: "minimax/minimax-m2.5", label: "[Paid] MiniMax M2.5" },
  { value: "z-ai/glm-5", label: "[Paid] Z.AI GLM 5" },
  { value: "moonshotai/kimi-k2.5", label: "[Paid] Kimi K2.5" },
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
  { value: "OTHER", label: "Other..." },
];

export const OLLAMA_MODELS = [
  { value: "devstral-small-2", label: "Devstral Small 2" },
  { value: "ministral-3", label: "Ministral 3" },
  { value: "mistral", label: "Mistral" },
  { value: "glm-4.7-flash", label: "GLM-4.7-Flash" },
  { value: "qwen3", label: "Qwen3" },
  { value: "qwen3-coder", label: "Qwen3 Coder" },
  { value: "gpt-oss", label: "GPT-OSS" },
  { value: "OTHER", label: "Other..." },
];

/**
 * Default model for each provider (first item in each list).
 * Used by settings initialization and E2E tests.
 */
export const DEFAULT_MODELS = {
  gemini: GEMINI_MODELS[0]?.value ?? "",
  openai: OPENAI_MODELS[0]?.value ?? "",
  mistral: MISTRAL_MODELS[0]?.value ?? "",
  openrouter: OPENROUTER_MODELS[0]?.value ?? "",
  ollama: OLLAMA_MODELS[0]?.value ?? "",
  lmstudio: "",
  custom: "",
} as const;
