// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type EvalTurnResult, type ToolCall } from "../../../../types.ts";

/**
 * A successful ppal-update-clip call.
 * @param args - Tool call args
 * @param noteCount - noteCount reported in the result
 * @returns The tool call
 */
export function updateClipCall(
  args: Record<string, unknown>,
  noteCount = 24,
): ToolCall {
  return {
    name: "ppal-update-clip",
    args,
    result: `{id:"1",noteCount:${noteCount}}`,
  };
}

/**
 * Turn results where only `turn` made tool calls.
 * @param length - Number of turns
 * @param turn - Index of the turn that made the calls
 * @param calls - Calls made in that turn
 * @returns The turn results
 */
export function turnsWithCalls(
  length: number,
  turn: number,
  calls: ToolCall[],
): EvalTurnResult[] {
  return Array.from({ length }, (_, i) => ({
    turnIndex: i,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: i === turn ? calls : [],
    durationMs: 1,
  }));
}
