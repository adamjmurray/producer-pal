// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  GEMINI_MODELS,
  MISTRAL_MODELS,
  OLLAMA_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
} from "#webui/lib/constants/models";

export { SYSTEM_INSTRUCTION } from "#webui/lib/system-instruction";

export const CHAT_UI_DOCS_URL = "https://producer-pal.org/guide/chat-ui";

const ALL_MODELS = [
  ...GEMINI_MODELS,
  ...OPENAI_MODELS,
  ...MISTRAL_MODELS,
  ...OPENROUTER_MODELS,
  ...OLLAMA_MODELS,
];

export const getModelName = (modelId: string): string =>
  (ALL_MODELS.find((m) => m.value === modelId)?.label ?? modelId).replaceAll(
    /^\[.*?]\s*/g,
    "",
  );

export const getThinkingBudget = (level: string): number => {
  switch (level) {
    case "Off":
      return 0;
    case "Max":
      return 16384;
    default:
      return -1; // Default / unknown → let API decide
  }
};
