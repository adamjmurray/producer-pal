// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Outbound links and defaults keyed by provider. Kept out of the settings
// components so those files export only components and stay hot-reloadable.

export const API_KEY_URLS: Record<string, string | undefined> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  mistral: "https://console.mistral.ai/home?workspace_dialog=apiKeys",
  openrouter: "https://openrouter.ai/settings/keys",
};

export const MODEL_DOCS_URLS: Record<string, string | undefined> = {
  anthropic: "https://docs.anthropic.com/en/docs/about-claude/models",
  gemini: "https://ai.google.dev/gemini-api/docs/models",
  openai: "https://platform.openai.com/docs/models",
  mistral: "https://docs.mistral.ai/getting-started/models",
  openrouter: "https://openrouter.ai/models",
  lmstudio: "https://lmstudio.ai/models",
  ollama: "https://ollama.com/search",
};

export const DEFAULT_LOCAL_URLS: Record<string, string> = {
  lmstudio: "http://localhost:1234",
  ollama: "http://localhost:11434",
};
