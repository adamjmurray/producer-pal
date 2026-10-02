// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Advances the readiness streak used by open-live-set.ts's start-up poll.
 *
 * Live can re-instantiate the device shortly after a Set loads, so a single
 * successful probe isn't proof the server is staying up - it can be the old
 * device answering its last request before the new one takes over. Requiring
 * two successes in a row (~POLL_INTERVAL_MS apart) filters that out.
 * @param streak - The current count of consecutive successful probes
 * @param probeSucceeded - Whether the probe just run succeeded
 * @returns The updated streak count
 */
export function nextReadyStreak(
  streak: number,
  probeSucceeded: boolean,
): number {
  return probeSucceeded ? streak + 1 : 0;
}
