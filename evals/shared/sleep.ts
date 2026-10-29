// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Wait for a while. Not for the V8 runtime, which has its own timers
 * (`src/shared/max/v8-wait-until.ts`).
 * @param ms - Milliseconds to wait
 * @returns A promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
