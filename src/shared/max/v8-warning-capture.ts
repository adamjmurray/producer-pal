// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Per-request buffering for console.warn(), so a warning lands on the response of
// the request that produced it.
//
// Warnings used to be buffered in the Max patch: a `list.group` fed by v8 outlet
// 1, joined onto whatever response came out next. The patch has no request
// identity, and parallel tool calls are routine, so a warning could be appended
// to an unrelated response — or wiped by the next request's arrival before anyone
// saw it. The buffer lives here instead, where the request is known.
//
// There is one active capture, and V8 has no async context to hang it off, so
// keeping it pointed at the right request takes three rules. All are
// load-bearing: drop one and warnings silently swap requests, or reach nobody.
//
//  1. A request re-asserts its own capture after every await it performs
//     (resumeWarningCapture). It cannot assume the capture it began is still
//     active: another request that started while it was parked has since made
//     itself active.
//  2. Every promise V8 can suspend on clears the capture for the wait and
//     restores it on resume (suspendWarningCapture). Only two exist —
//     requestNode and requestCodeExecution — and a third has to do the same.
//  3. A capture that has responded is dead, and never becomes active again.
//     Fire-and-forget work outlives its request, so the capture a resume hands
//     back may be one nobody is going to read.
//
// Between stretches nothing is active, and that is the point: a warning with no
// request in flight (a Max setter, or async work that outlived its response) has
// no response to land on, so it goes to the Max console instead of contaminating
// someone else's.

/** Warnings collected for one in-flight request. */
export interface WarningCapture {
  messages: string[];
  dropped: number;
  /**
   * True once the request has responded. A pointer alone can't say that, and
   * async work outliving a response hands its capture back on resume — see
   * suspendWarningCapture.
   */
  ended: boolean;
}

/**
 * Ceiling on warnings held for one request, matching the `list.group 1000` this
 * replaces. A tool looping over a big selection can warn per item, and the
 * response has to stay sendable.
 */
export const MAX_CAPTURED_WARNINGS = 1000;

let activeCapture: WarningCapture | null = null;

/**
 * Start collecting warnings for a request, making it the active capture.
 *
 * @returns The new capture, to pass to endWarningCapture
 */
export function beginWarningCapture(): WarningCapture {
  activeCapture = { messages: [], dropped: 0, ended: false };

  return activeCapture;
}

/**
 * Make a request's capture active again after one of its awaits.
 *
 * Needed because another request may have started, and made itself active, while
 * this one was parked. Without it this request's remaining warnings land on that
 * other request's response.
 *
 * @param capture - The capture returned by beginWarningCapture
 */
export function resumeWarningCapture(capture: WarningCapture): void {
  activeCapture = capture;
}

/**
 * Stop collecting for a request and read back what it gathered.
 *
 * Only clears the active capture when it is still this one: with requests
 * overlapping, the one finishing here may not be the one currently running.
 *
 * @param capture - The capture returned by beginWarningCapture
 * @returns The warnings to append to this request's response
 */
export function endWarningCapture(capture: WarningCapture): string[] {
  capture.ended = true;

  if (activeCapture === capture) {
    activeCapture = null;
  }

  if (capture.dropped > 0) {
    return [
      ...capture.messages,
      `${capture.dropped} more warning(s) dropped (limit ${MAX_CAPTURED_WARNINGS})`,
    ];
  }

  return capture.messages;
}

/**
 * Record a warning against the request in flight.
 *
 * @param message - The warning text
 * @returns Whether a request took it; false means the caller has to report it
 *   some other way, because no response is coming
 */
export function recordWarning(message: string): boolean {
  if (activeCapture == null || activeCapture.ended) return false;

  if (activeCapture.messages.length < MAX_CAPTURED_WARNINGS) {
    activeCapture.messages.push(message);
  } else {
    activeCapture.dropped++;
  }

  return true;
}

/**
 * Await a promise with no capture active, restoring the caller's on resume.
 *
 * Wrap every promise V8 can suspend on. Clearing for the wait is what sends a
 * warning raised while nothing is running to the Max console instead of onto a
 * parked request; restoring is what lets the tool code above this keep warning
 * into its own request after the round trip.
 *
 * @param promise - The promise to await
 * @returns The promise's value
 */
export async function suspendWarningCapture<T>(
  promise: Promise<T>,
): Promise<T> {
  const suspended = activeCapture;

  activeCapture = null;

  try {
    return await promise;
  } finally {
    // Fire-and-forget work outlives the request that started it, so the capture
    // saved above can have responded while this was parked. Handing it back
    // would swallow the continuation's warnings and, worse, leave a dead
    // capture installed for whatever warns next. Nothing to resume: the
    // continuation has no response to ride, so its warnings go to the Max
    // console, and a request actually running re-asserts its own capture.
    activeCapture = suspended?.ended === false ? suspended : null;
  }
}

/** Drop any capture left active by a previous test. For test setup only. */
export function resetWarningCapture(): void {
  activeCapture = null;
}
