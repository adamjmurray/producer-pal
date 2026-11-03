// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type TurnResult } from "./types.ts";

type ReasoningFields = Pick<TurnResult, "reasoningText" | "finishReason">;

/**
 * The fields that say what a turn thought and why it stopped.
 *
 * Omits a field the turn lacks, so a transport that doesn't expose it leaves no
 * key behind (the same way `reasoningTokens` is omitted when 0).
 *
 * @param turn - A transport's turn result, or a turn built from one
 * @returns An object to spread into the turn record
 */
export function reasoningFields(turn: ReasoningFields): ReasoningFields {
  return {
    ...(turn.reasoningText != null &&
      turn.reasoningText !== "" && { reasoningText: turn.reasoningText }),
    ...(turn.finishReason != null &&
      turn.finishReason !== "" && { finishReason: turn.finishReason }),
  };
}
