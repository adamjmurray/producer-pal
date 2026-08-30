// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { act } from "@testing-library/preact";
import { onTestFinished, vi } from "vitest";

/** Event-loop turns a flush yields by default. */
const DEFAULT_FLUSH_TURNS = 12;

/**
 * Yield N macrotask turns, draining microtasks and due timers on each.
 *
 * The barrier for effects that need a few turns to land: preact's post-paint
 * effects, a debounce mocked to ~0, an IndexedDB round trip. Count turns rather
 * than sleeping a fixed number of milliseconds — a sleep long enough on a fast
 * machine can be too short on a loaded CI box, and an assertion that something
 * did NOT happen then passes for the wrong reason.
 * @param turns - How many turns to yield
 */
export async function flushTurns(turns = DEFAULT_FLUSH_TURNS): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Dispatch a `hashchange` event inside act() and yield long enough for any
 * debounced hash watcher to react. Used by hooks that read `window.location.hash`
 * to drive conversation/voice routing.
 */
export async function fireHashChange(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await flushTurns();
  });
}

/**
 * Make every localStorage write throw, the way a full quota does (and the way
 * browsers with storage blocked do), so persistence failure paths are testable.
 *
 * Restores itself via onTestFinished rather than leaning on the config's
 * `restoreMocks` — verified empirically that a spy installed on happy-dom's
 * `localStorage` is NOT restored between tests, so without this every later
 * test in the file inherits the throwing write.
 * @returns The spy, so a test can restore mid-test and exercise recovery
 */
export function breakStorageWrites(): ReturnType<typeof vi.spyOn> {
  const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new DOMException("quota exceeded", "QuotaExceededError");
  });

  onTestFinished(() => spy.mockRestore());

  return spy;
}
