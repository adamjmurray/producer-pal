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
export const VERSION = "2.0.1";

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

// --- Web UI chat system instruction ---

// The webui chat's built-in system instruction (NOT the ppal-connect skills
// blob). A shared config constant so both the browser (chat send + the
// Instructions editor's built-in reference) and Node-for-Max (the system-prompt
// store, which hashes it for fork-time drift provenance) agree on one
// definition.
export const SYSTEM_INSTRUCTION = `You are an AI music composition assistant using Producer Pal, a toolset for Ableton Live.

Help users create, edit, and arrange music — tracks, clips, devices, MIDI, audio, and arrangement.

When asked to create or edit music, do it. Use your tools to find what you need (tracks, clips, scale, drum maps) instead of asking the user for details you can look up, and write the musical content yourself using the project's key and scale unless the user gives specific notes. Don't make changes the user didn't ask for.

If a tool returns an error, read the message, fix the arguments, and call it again — don't explain the error away or claim something isn't supported.

If the user hasn't connected to Ableton Live, suggest connecting. Call ppal-connect to connect.

Be creative and focus on the user's musical goals.`;

/**
 * Resolve the system instruction actually sent to the model: a non-blank custom
 * override (~/.producer-pal/system-prompt.md) fully replaces the built-in;
 * blank/absent falls back to {@link SYSTEM_INSTRUCTION}. Shared by the chat
 * adapter (send) and the conversation snapshot / transcript notice (display) so
 * all three agree on what "the system prompt" is.
 * @param override - The custom system-prompt override, if any
 * @returns The effective system instruction
 */
export function resolveSystemInstruction(override?: string | null): string {
  return override?.trim() ? override : SYSTEM_INSTRUCTION;
}
