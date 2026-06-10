// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared, cross-cutting configuration constants used across the codebase
// (notation layer, tools layer, server, portal, and web UI).

// Semantic versioning: major.minor.patch
// Currently in pre-release, working towards 1.0.0
// NOTE: the VERSION value is updated in place by
// scripts/build-and-release/bump-version.ts (regex on this exact line shape).
export const VERSION = "1.4.13";

// Minimum required Ableton Live version (no "v" prefix)
export const MIN_LIVE_VERSION = "12.3.0";

/**
 * Tolerance (in beats) below which two beat-time positions are treated as the
 * SAME musical position — a "millibeat" floor that absorbs floating-point drift
 * from fraction / round-trip math (e.g. a triplet position vs a nearby decimal).
 *
 * This is the project's canonical "same position" epsilon. It is used for
 * note-collision dedupe, v0 deletion matching, serializer time-grouping (the
 * round-trip floor), locator-time matching, and start-marker comparisons.
 *
 * It is specifically a POSITION-equality tolerance. It is deliberately NOT
 * shared with the other 0.001-magnitude tolerances in the codebase, which are
 * distinct concepts that only happen to share a value today and must be free to
 * change independently:
 *   - duration-equality comparisons (serializer chord/merge/drum grouping);
 *   - the meter-scaled duration-change threshold (`0.001 * denomFactor`);
 *   - probability-equality (the 0..1 probability scale, not beats);
 *   - the fraction-match epsilon (`1e-6`, serializer-fractions).
 * Do not redirect those here without re-checking that they truly want to move
 * together.
 */
export const SAME_TIME_EPSILON = 0.001;
