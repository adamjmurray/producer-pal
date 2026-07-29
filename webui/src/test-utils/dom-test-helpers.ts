// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { act } from "@testing-library/preact";
import { onTestFinished, vi } from "vitest";

/**
 * Dispatch a `hashchange` event inside act() and yield long enough for any
 * debounced hash watcher to react. Used by hooks that read `window.location.hash`
 * to drive conversation/voice routing.
 */
export async function fireHashChange(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await new Promise((r) => setTimeout(r, 50));
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
