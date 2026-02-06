// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CODE_EXEC_TIMEOUT_MS } from "#src/tools/clip/code-exec/code-exec-types.ts";

/**
 * Safety buffer subtracted from timeoutMs to create the loop deadline.
 * Uses 2x the per-clip code execution timeout to account for IPC overhead,
 * Live API calls, and response serialization that occur after the last iteration.
 */
export const LOOP_DEADLINE_BUFFER_MS = CODE_EXEC_TIMEOUT_MS * 2;

/**
 * Compute an absolute deadline timestamp for multi-clip loops.
 * Subtracts a safety buffer so the loop finishes before the Node-side
 * MCP timeout fires.
 *
 * @param timeoutMs - The MCP request timeout from ToolContext (undefined when not available)
 * @returns Absolute deadline timestamp, or null if timeoutMs is not available
 */
export function computeLoopDeadline(timeoutMs?: number): number | null {
  if (timeoutMs == null) {
    return null;
  }

  return Date.now() + timeoutMs - LOOP_DEADLINE_BUFFER_MS;
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
