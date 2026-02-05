// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared utilities for Responses API implementations (OpenAI and OpenRouter)
 */
import type { ChatOptions, TurnResult } from "../types.ts";

/**
 * Applies common chat options to a Responses API request body
 *
 * Both OpenAI and OpenRouter Responses APIs use the same parameter names
 * for reasoning, max_output_tokens, temperature, and instructions.
 *
 * @param body - Request body object to modify in place
 * @param options - Chat options with values to apply
 */
export function applyResponsesOptions(
  body: Record<string, unknown>,
  options: ChatOptions,
): void {
  if (options.thinking) {
    body.reasoning = {
      effort: options.thinking,
      summary: options.thinkingSummary ?? "auto",
    };
  }

  if (options.outputTokens != null) {
    body.max_output_tokens = options.outputTokens;
  }

  if (options.randomness != null) {
    body.temperature = options.randomness;
  }

  if (options.instructions != null) {
    body.instructions = options.instructions;
  }
}

/**
 * Result from processing a single output item
 */
export interface OutputItemResult {
  text?: string;
  toolCall?: TurnResult["toolCalls"][number];
}

/**
 * Extracts text content from message output items
 *
 * @param content - Array of content items from a message output
 * @returns Concatenated text from output_text items
 */
export function extractMessageText(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}
