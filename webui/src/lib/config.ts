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

export const CHAT_UI_DOCS_URL = "https://producer-pal.org/guide/chat-ui";

export const SYSTEM_INSTRUCTION = `You are an AI music composition assistant using Producer Pal, a toolset for Ableton Live.
Help users create, edit, and arrange music — tracks, clips, devices, MIDI, audio, and arrangement.
Always follow the user's direction. Do not create or modify musical content unless asked.
If the user hasn't connected to Ableton Live, suggest connecting. Call ppal-connect to connect.
Be creative and focus on the user's musical goals.`;

const ALL_MODELS = [
  ...GEMINI_MODELS,
  ...OPENAI_MODELS,
  ...MISTRAL_MODELS,
  ...OPENROUTER_MODELS,
  ...OLLAMA_MODELS,
];

export const getModelName = (modelId: string): string =>
  ALL_MODELS.find((m) => m.value === modelId)?.label ?? modelId;

export const getThinkingBudget = (level: string): number => {
  switch (level) {
    case "Low":
      return 2048;
    case "Medium":
      return 4096;
    case "High":
      return 16384;
    default:
      return -1; // Adaptive / unknown → let API decide
  }
};
