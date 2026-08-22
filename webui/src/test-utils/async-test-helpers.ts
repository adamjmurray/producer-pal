// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
