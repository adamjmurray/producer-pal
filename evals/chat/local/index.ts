// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChatOptions } from "../shared/types.ts";
import { runLocalChat } from "./chat.ts";

/**
 * Run an interactive chat session with a local OpenAI-compatible server
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runLocal(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  if (options.api === "responses") {
    console.warn(
      "Warning: local provider does not support Responses API, using Chat API",
    );
  }

  await runLocalChat(initialText, options);
}
