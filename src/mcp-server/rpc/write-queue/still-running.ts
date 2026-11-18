// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A timed-out call answers its caller while V8 may still be running it. Node
// keeps a promise for V8's late answer as a symbol on the timeout response, so
// the write queue can hold the next write until V8 is done. No JSON.stringify
// or schema check on the way out to the client will ever see it.

const STILL_RUNNING = Symbol("stillRunning");

/**
 * Note that V8 may still be running a response's call.
 * @param response - The response, marked in place
 * @param finished - Resolves when V8 answers late, or it is given up on
 */
export function markStillRunning(
  response: object,
  finished: Promise<void>,
): void {
  Object.defineProperty(response, STILL_RUNNING, { value: finished });
}

/**
 * @param response - A tool response
 * @returns A promise for when V8 is done with the call, or undefined when it
 *   already is
 */
export function whenFinished(response: object): Promise<void> | undefined {
  return (response as Record<symbol, Promise<void> | undefined>)[STILL_RUNNING];
}
