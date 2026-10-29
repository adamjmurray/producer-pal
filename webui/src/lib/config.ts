// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ThinkingEffort } from "#webui/chat/sdk/provider/thinking-effort";
import {
  ANTHROPIC_MODELS,
  GEMINI_MODELS,
  MISTRAL_MODELS,
  OLLAMA_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  VERCEL_MODELS,
} from "#webui/lib/constants/models";

export {
  SYSTEM_INSTRUCTION,
  resolveSystemInstruction,
} from "#src/shared/config";

export const CHAT_UI_DOCS_URL = "https://producer-pal.org/guide/chat-ui";

export const CONTEXT_DOCS_URL = "https://producer-pal.org/guide/context";

export const REMOTE_SCRIPT_DOCS_URL =
  "https://producer-pal.org/guide/remote-script";

export const FINISH_INSTALLATION_DOCS_URL =
  "https://producer-pal.org/installation#finish-the-installation";

const ALL_MODELS = [
  ...ANTHROPIC_MODELS,
  ...GEMINI_MODELS,
  ...OPENAI_MODELS,
  ...MISTRAL_MODELS,
  ...OPENROUTER_MODELS,
  ...VERCEL_MODELS,
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

/**
 * Maps the UI thinking level onto the shared thinking setting.
 * @param level - UI thinking level ("Off", "Max", or any default level)
 * @returns The shared thinking setting
 */
export const toThinkingEffort = (level: string): ThinkingEffort => {
  switch (level) {
    case "Off":
      return "off";
    case "Max":
      return "max";
    default:
      return "auto";
  }
};
