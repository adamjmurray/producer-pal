// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { LOCAL_CONFIG } from "#evals/shared/provider-configs.ts";
import {
  runChatSession,
  type ChatProviderConfig,
} from "../shared/api/chat-api-base.ts";
import { type ChatOptions } from "../shared/types.ts";

const localConfig: ChatProviderConfig = {
  ...LOCAL_CONFIG,
  providerName: "Local (Chat API)",
  apiKeyOptional: true,
  // eslint-disable-next-line unicorn/no-useless-undefined -- must return undefined, not empty object
  buildReasoningConfig: () => undefined,
};

/**
 * Run an interactive chat session with a local OpenAI-compatible server
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runLocalChat(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  await runChatSession(initialText, options, localConfig);
}
