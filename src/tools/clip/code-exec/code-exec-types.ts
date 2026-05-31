// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type definitions for code execution feature.
 * These types are shared between Node (MCP server) and V8 (Live API adapter).
 */

/**
 * Note format exposed to user code. Uses camelCase and the clip's musical beats
 * (an eighth in 6/8) — NOT Ableton's quarter-note beats — so start/duration
 * share a unit with `CodeExecutionContext.beatsPerBar` and `CodeClipContext.length`.
 */
export interface CodeNote {
  pitch: number; // MIDI pitch 0-127
  start: number; // musical beats from clip start
  duration: number; // musical beats
  velocity: number; // 1-127
  velocityDeviation: number; // 0-127
  probability: number; // 0.0-1.0
}

/**
 * Track context passed to user code.
 */
export interface CodeTrackContext {
  index: number;
  name: string;
  type: "midi" | "audio";
  color: string | null;
}

/**
 * Clip context passed to user code.
 */
export interface CodeClipContext {
  id: string;
  name: string | null;
  length: number; // musical beats
  timeSignature: string; // e.g., "4/4"
  looping: boolean;
  index: number; // 0-based position in the batch (matches transforms' clip.index)
  count: number; // total clips in the batch (matches transforms' clip.count)
}

/**
 * Location context passed to user code.
 */
export interface CodeLocationContext {
  view: "session" | "arrangement";
  slot?: string; // session only, "trackIndex/sceneIndex"
  arrangementStart?: number; // arrangement only, in song musical beats
}

/**
 * Live set context passed to user code.
 */
export interface CodeLiveSetContext {
  tempo: number;
  scale?: string; // e.g., "C Minor"
  timeSignature: string; // e.g., "4/4"
}

/**
 * Full context object passed to user code.
 */
export interface CodeExecutionContext {
  track: CodeTrackContext;
  clip: CodeClipContext;
  location: CodeLocationContext;
  liveSet: CodeLiveSetContext;
  beatsPerBar: number; // musical beats per bar (time-sig numerator); convenience for math
}

/**
 * Result of code execution.
 * Either transformed notes or an error message.
 */
export type CodeExecutionResult =
  | { success: true; notes: CodeNote[] }
  | { success: false; error: string };

/**
 * Result of sandboxed code execution (general-purpose).
 * Returns raw result from the sandbox without note-specific validation.
 */
export type SandboxResult =
  | { success: true; result: unknown }
  | { success: false; error: string };

/** Timeout for code execution per clip (milliseconds) */
export const CODE_EXEC_TIMEOUT_MS = 2000;
