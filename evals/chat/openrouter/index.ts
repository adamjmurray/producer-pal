// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ChatOptions } from "../shared/types.ts";
import { runOpenRouterChat } from "./chat.ts";
import { runOpenRouterResponses } from "./responses.ts";

/**
 * Run an interactive chat session with OpenRouter
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenRouter(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiStyle = options.api ?? "chat";

  await (apiStyle === "responses"
    ? runOpenRouterResponses(initialText, options)
    : runOpenRouterChat(initialText, options));
}
