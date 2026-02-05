// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import OpenAI from "openai";
import {
  runChatSession,
  type ChatProviderConfig,
} from "../shared/api/chat-api-base.ts";
import type { ChatOptions } from "../shared/types.ts";
import { DEFAULT_MODEL } from "./config.ts";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const openRouterConfig: ChatProviderConfig = {
  apiKeyEnvVar: "OPENROUTER_KEY",
  providerName: "OpenRouter (Chat API)",
  defaultModel: DEFAULT_MODEL,
  createClient: (apiKey: string) =>
    new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://producer-pal.org",
        "X-Title": "Producer Pal CLI",
      },
    }),
  buildReasoningConfig: (thinkingLevel: string) => ({
    reasoning: { effort: thinkingLevel },
  }),
};

/**
 * Run an interactive chat session with OpenRouter Chat API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenRouterChat(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  await runChatSession(initialText, options, openRouterConfig);
}
