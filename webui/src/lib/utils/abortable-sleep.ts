// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Promise-based setTimeout that rejects instead of resolving when the signal
 * aborts, so a canceled turn unwinds its waiters rather than serving out a
 * minute-long backoff nobody is waiting for anymore.
 *
 * Both rate-limit retry paths wait on this — the main chat's executeWithRetry
 * and the subagent workers' runSubagentWithRetry — which is why the rejection
 * message is a parameter: each surfaces its own wording upstream.
 * @param ms - Delay in milliseconds
 * @param abortSignal - Signal that cancels the delay
 * @param abortMessage - Message for the error thrown when the signal aborts
 */
export function abortableSleep(
  ms: number,
  abortSignal?: AbortSignal,
  abortMessage = "Aborted",
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error(abortMessage));

      return;
    }

    const timer: { id: ReturnType<typeof setTimeout> | null } = { id: null };

    const onAbort = () => {
      if (timer.id != null) clearTimeout(timer.id);
      reject(new Error(abortMessage));
    };

    timer.id = setTimeout(() => {
      abortSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}
