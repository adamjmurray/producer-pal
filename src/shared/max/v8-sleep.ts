// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Sleep utility for V8 environment in Max for Live
 * Uses Max's Task object for scheduling
 */

import { suspendWarningCapture } from "./v8-warning-capture.ts";

// Declare global Task type from Max for Live environment
declare const Task: new (callback: () => void) => {
  schedule: (ms: number) => void;
};

/**
 * Sleep for the specified number of milliseconds.
 *
 * A scheduled Task is a real macrotask, so V8 runs whatever Max dispatches next
 * while this is parked. Suspending the warning capture is what keeps the
 * caller's warnings on the caller's response. See v8-warning-capture.ts.
 *
 * @param ms - Milliseconds to sleep
 * @returns Resolves after the delay
 */
const sleep = (ms: number): Promise<void> =>
  suspendWarningCapture(
    new Promise((resolve) => new Task(resolve).schedule(ms)),
  );

interface WaitUntilOptions {
  pollingInterval?: number;
  maxRetries?: number;
}

/**
 * Wait until a predicate returns true, polling at intervals
 * @param predicate - Function that returns true when condition is met
 * @param options - Options
 * @param options.pollingInterval - Milliseconds between polls (default: 10)
 * @param options.maxRetries - Maximum number of retries before giving up (default: 10)
 * @returns True if predicate became true, false if max retries exceeded
 */
export async function waitUntil(
  predicate: () => boolean,
  { pollingInterval = 10, maxRetries = 10 }: WaitUntilOptions = {},
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (predicate()) {
      return true;
    }

    await sleep(pollingInterval);
  }

  return false;
}
