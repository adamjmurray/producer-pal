// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Finding the track a run created, so a grading read can look at it wherever
 * the model put it.
 */

import { lastSuccessfulToolCall } from "../../assertions/index.ts";
import { parseToolResult } from "#evals/chat/mcp.ts";
import { type EvalTurnResult } from "../../types.ts";

/** basic-midi-4-track has five tracks (t0-t4), so a new one lands at t5. */
const FIRST_NEW_TRACK = "t5";

/**
 * The path of the last track the run created successfully, or t5 (the first
 * slot past the Set's own tracks) when no create call reported one.
 *
 * @param turns - All conversation turns
 * @returns A track path, e.g. "t5"
 */
export function newTrackPath(turns: EvalTurnResult[]): string {
  const call = lastSuccessfulToolCall(turns, "any", "ppal-create-track");

  return firstResultPath(call?.result) ?? FIRST_NEW_TRACK;
}

/**
 * The first `path` in a tool result, which is one entry or a list of them.
 *
 * @param result - The call's raw result text
 * @returns The path, or undefined
 */
export function firstResultPath(
  result: string | undefined,
): string | undefined {
  if (result == null) {
    return undefined;
  }

  try {
    const parsed: unknown = parseToolResult(result);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const path = (entry as { path?: unknown } | null)?.path;

    return typeof path === "string" ? path : undefined;
  } catch {
    return undefined;
  }
}
