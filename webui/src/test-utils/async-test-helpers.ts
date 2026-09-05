// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { waitFor, type waitForOptions } from "@testing-library/preact";

/**
 * A promise the test opens by hand, for pinning where an async body suspends —
 * `await` it inside the code under test, and release it when the test is ready
 * for that code to continue.
 * @returns The promise and the function that resolves it
 */
export function openGate(): [Promise<void>, () => void] {
  let release: (() => void) | undefined;

  // The executor runs synchronously, so `release` is set before the return.
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  return [held, release as () => void];
}

/** Event-loop turns waitUntil yields before it gives up. */
const WAIT_UNTIL_TURNS = 200;

/**
 * Yield event-loop turns until a plain predicate goes true.
 *
 * For progress the DOM never reflects — a flag an adapter sets, a counter a
 * mock bumps — which testing-library's waitFor can't see, and where a fixed
 * sleep would only be a guess. Throws rather than hanging if it never holds.
 * @param predicate - The condition to wait for
 * @param what - What is being waited for, named in the timeout message
 */
export async function waitUntil(
  predicate: () => boolean,
  what: string,
): Promise<void> {
  for (let turn = 0; turn < WAIT_UNTIL_TURNS; turn++) {
    if (predicate()) return;

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Timed out waiting for ${what}`);
}

/** How often waitForHookState re-checks, in ms. */
const HOOK_STATE_POLL_MS = 1;

/**
 * waitFor for a condition on hook state rather than on the DOM.
 *
 * waitFor re-checks whenever the DOM mutates, and otherwise only once per
 * interval — so a condition on a hook's return value waits out the 50ms default
 * every single time, however fast it actually came true. Polling faster costs
 * nothing here and takes ~50ms per wait off the suite.
 * @param check - Assertion to retry until it passes
 * @param options - waitFor options; `interval` overrides the fast default
 * @returns The callback's result, once it stops throwing
 */
export function waitForHookState<T>(
  check: () => T | Promise<T>,
  options?: waitForOptions,
): Promise<T> {
  return waitFor(check, { interval: HOOK_STATE_POLL_MS, ...options });
}
