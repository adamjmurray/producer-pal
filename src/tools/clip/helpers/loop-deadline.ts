// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { CODE_EXEC_TIMEOUT_MS } from "#src/tools/clip/code-exec/code-exec-types.ts";

/**
 * Largest safety buffer subtracted from timeoutMs to create the loop deadline.
 * Uses 2x the per-clip code execution timeout to account for IPC overhead,
 * Live API calls, and response serialization that occur after the last iteration.
 */
export const LOOP_DEADLINE_BUFFER_MS = CODE_EXEC_TIMEOUT_MS * 2;

/**
 * Compute an absolute deadline timestamp for multi-clip loops.
 * Subtracts a safety buffer so the loop finishes before the Node-side
 * MCP timeout fires.
 *
 * The buffer never takes more than half the budget. The Timeout setting goes
 * down to 1 second, and a flat 4-second buffer put the deadline in the past
 * before the first iteration — every deadline-guarded loop then did nothing at
 * all and reported "ran out of time after 0 of N". Half a short budget is still
 * enough to land some of the batch.
 *
 * @param timeoutMs - The MCP request timeout from ToolContext (undefined when not available)
 * @returns Absolute deadline timestamp, or null if timeoutMs is not available
 */
export function computeLoopDeadline(timeoutMs?: number): number | null {
  if (timeoutMs == null) {
    return null;
  }

  const buffer = Math.min(LOOP_DEADLINE_BUFFER_MS, timeoutMs / 2);

  return Date.now() + timeoutMs - buffer;
}

/**
 * Check if the loop deadline has been exceeded.
 *
 * @param deadline - Absolute deadline timestamp from computeLoopDeadline, or null
 * @returns true if deadline is exceeded, false if null or not yet exceeded
 */
export function isDeadlineExceeded(deadline: number | null): boolean {
  if (deadline == null) {
    return false;
  }

  return Date.now() >= deadline;
}

/**
 * Whether a loop should stop now, warning about what it did not reach.
 *
 * The Node-side timeout replaces the whole response with an error, so a run that
 * overshoots tells the caller nothing about what landed. Stopping just short
 * keeps the partial result and names the rest.
 *
 * @param deadline - The request deadline from ToolContext
 * @param describeRemaining - Builds the warning; called only when time is up
 * @returns true if the deadline has passed and the caller should stop
 */
export function stopForDeadline(
  deadline: number | null | undefined,
  describeRemaining: () => string,
): boolean {
  if (!isDeadlineExceeded(deadline ?? null)) return false;

  console.warn(describeRemaining());

  return true;
}
