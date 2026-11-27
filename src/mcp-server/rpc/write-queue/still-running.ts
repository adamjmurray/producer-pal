// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A timed-out call answers its caller while V8 may still be running it. Node
// keeps a promise for V8's late answer as a symbol on the timeout response, so
// the write queue can hold the next write until V8 is done and close the call's
// undo step then. No JSON.stringify or schema check on the way out to the
// client will ever see it.

import { type McpResponse } from "../../max-api-adapter.ts";

const STILL_RUNNING = Symbol("stillRunning");

/**
 * Note that V8 may still be running a response's call.
 * @param response - The response, marked in place
 * @param finished - Resolves with V8's late answer, or null once it is given up on
 */
export function markStillRunning(
  response: object,
  finished: Promise<McpResponse | null>,
): void {
  Object.defineProperty(response, STILL_RUNNING, { value: finished });
}

/**
 * @param response - A tool response
 * @returns A promise for V8's late answer (null if given up on), or undefined
 *   when V8 is already done with the call
 */
export function whenFinished(
  response: object,
): Promise<McpResponse | null> | undefined {
  return (response as Record<symbol, Promise<McpResponse | null> | undefined>)[
    STILL_RUNNING
  ];
}
