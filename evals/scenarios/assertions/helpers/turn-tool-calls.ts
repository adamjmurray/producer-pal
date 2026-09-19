// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Pulling the tool calls an assertion should grade out of a run's turns, and
 * telling a successful call from a failed one.
 */

import { parseToolResult } from "#evals/chat/mcp.ts";
import { type EvalTurnResult, type ToolCall } from "../../types.ts";

/**
 * Get target turns based on assertion's turn specification
 *
 * @param turns - All conversation turns
 * @param turn - Turn specification: number index, "any", or undefined
 * @returns Filtered array of matching turns
 */
export function getTargetTurns(
  turns: EvalTurnResult[],
  turn: number | "any" | undefined,
): EvalTurnResult[] {
  if (turn === "any" || turn == null) {
    return turns;
  }

  return [turns[turn]].filter((t): t is EvalTurnResult => t !== undefined);
}

/**
 * The tool calls that SUCCEEDED, optionally filtered by turn.
 *
 * Grading reads outcomes, not attempts. A model that hits a tool error is told
 * to fix its arguments and call again, so a failed call is a discarded draft —
 * counting it, or reading its args, fails a model for recovering correctly.
 * Use `getAllToolCalls` when the attempt itself is what's being graded (e.g.
 * "did it reach for a tool it shouldn't have").
 *
 * @param turns - All conversation turns
 * @param turn - Optional turn filter (number index, "any"/undefined for all)
 * @returns Flat array of successful tool calls
 */
export function getToolCalls(
  turns: EvalTurnResult[],
  turn?: number | "any",
): ToolCall[] {
  return getAllToolCalls(turns, turn).filter((c) => !toolCallFailed(c));
}

/**
 * Every tool call from turns, failed attempts included.
 *
 * @param turns - All conversation turns
 * @param turn - Optional turn filter (number index, "any"/undefined for all)
 * @returns Flat array of tool calls
 */
export function getAllToolCalls(
  turns: EvalTurnResult[],
  turn?: number | "any",
): ToolCall[] {
  return getTargetTurns(turns, turn).flatMap((t) => t.toolCalls);
}

/**
 * Whether a tool call came back as an error rather than a payload.
 *
 * The MCP `isError` flag decides it when the transport reported one. Only some
 * do, so a call without it falls back to `parsedToolResult`.
 *
 * @param call - The tool call to check
 * @returns True when the call errored
 */
export function toolCallFailed(call: ToolCall): boolean {
  return call.isError ?? parsedToolResult(call) == null;
}

/**
 * A tool call's result parsed into an object, or null when it has none.
 *
 * The fallback for `toolCallFailed` when the transport reported no `isError`:
 * errors come back as prose ("Error: slot or arrangementStart is required",
 * "ERROR: user cancelled MCP tool call") and successes as a JSON/compact-literal
 * payload, so parsing to an object separates them. Structural on purpose:
 * matching error prose would break on a reword.
 *
 * @param call - The tool call to read
 * @returns The parsed result object, or null when absent/unparseable
 */
export function parsedToolResult(
  call: ToolCall,
): Record<string, unknown> | null {
  if (call.result == null) {
    return null;
  }

  try {
    const parsed = parseToolResult(call.result);

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The LAST call to `toolName` that actually succeeded.
 *
 * Grading must not read the first call by name. A model that hits a tool error
 * is told to fix the arguments and call again, so the first call is often a
 * discarded failed attempt — reading it grades args that never took effect, or
 * an id that was never created, and fails a model for recovering correctly.
 *
 * Falls back to the last call by name when none succeeded, so a scenario that
 * never got a good call still fails on the payload it was grading rather than
 * on a "not found" message that hides why.
 *
 * @param turns - All turn results
 * @param turn - Turn filter (index, "any", or undefined for all)
 * @param toolName - Tool name to match
 * @returns The last successful call, the last call by name, or undefined
 */
export function lastSuccessfulToolCall(
  turns: EvalTurnResult[],
  turn: number | "any" | undefined,
  toolName: string,
): ToolCall | undefined {
  const calls = getAllToolCalls(turns, turn).filter((c) => c.name === toolName);

  return calls.toReversed().find((c) => !toolCallFailed(c)) ?? calls.at(-1);
}
