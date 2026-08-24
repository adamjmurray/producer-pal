// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Disabled stub for live-api-build-stats.ts.
 * Substituted by rolldown when ENABLE_BUILD_STATS is not set, so a release build
 * carries no counters and no per-resolution bookkeeping.
 *
 * IMPORTANT: If this file is renamed or moved, update its entry in
 * config/rolldown-plugin-stub-modules.mjs (BUILD_STATS_STUBS) to match.
 *
 * Declares its own copy of the interface rather than importing the type: an
 * import naming the real module is what the substitution resolves back to this
 * file, and the parity test in tests/objects/live-api-build-stats.test.ts is what keeps
 * the two in step.
 */

/** Mirrors LiveApiBuildStats in live-api-build-stats.ts. */
export interface LiveApiBuildStats {
  /** How many times the call asked for an object */
  resolved: number;
  /** How many distinct targets those asks named */
  distinct: number;
  /** How many asks had to build an object instead of reusing one */
  constructed: number;
  /** Resolutions per target shape, most-resolved first */
  byShape: [string, number][];
}

/** Stub: nothing is counted, so there is nothing to reset. */
export function beginLiveApiBuildStats(): void {
  // Build stats are disabled at build time
}

/**
 * Stub: no-op since build stats are disabled.
 * @param _target - Unused
 */
export function recordLiveApiResolve(_target: string): void {
  // Build stats are disabled at build time
}

/** Stub: no-op since build stats are disabled. */
export function recordLiveApiConstruct(): void {
  // Build stats are disabled at build time
}

/**
 * Stub: always zero since nothing is counted.
 * @returns Empty counts
 */
export function liveApiBuildStats(): LiveApiBuildStats {
  return { resolved: 0, distinct: 0, constructed: 0, byShape: [] };
}

/** Stub: no-op since there is nothing to report. */
export function reportLiveApiBuildStats(): void {
  // Build stats are disabled at build time
}
