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

const openaiConfig: ChatProviderConfig = {
  apiKeyEnvVar: "OPENAI_KEY",
  providerName: "OpenAI (Chat API)",
  defaultModel: DEFAULT_MODEL,
  createClient: (apiKey: string) => new OpenAI({ apiKey }),
  buildReasoningConfig: (thinkingLevel: string) => ({
    reasoning_effort: thinkingLevel,
  }),
};

/**
 * Run an interactive chat session with OpenAI Chat API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenAIChat(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  await runChatSession(initialText, options, openaiConfig);
}
