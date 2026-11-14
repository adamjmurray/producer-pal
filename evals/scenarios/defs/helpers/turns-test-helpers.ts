// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type EvalTurnResult, type ToolCall } from "../../types.ts";

/**
 * A recorded tool call.
 *
 * @param name - Full tool name
 * @param args - The call's args
 * @param result - The call's result text
 * @param isError - True for a call the tool refused
 * @returns The tool call
 */
export function toolCall(
  name: string,
  args: Record<string, unknown>,
  result = "{}",
  isError = false,
): ToolCall {
  return { name, args, result, isError };
}

/**
 * Turn results, one per list of calls.
 *
 * @param callsPerTurn - The calls each turn made, turn 0 first
 * @returns The turn results
 */
export function turnsOf(...callsPerTurn: ToolCall[][]): EvalTurnResult[] {
  return callsPerTurn.map((toolCalls, turnIndex) => ({
    turnIndex,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls,
    durationMs: 1,
  }));
}
