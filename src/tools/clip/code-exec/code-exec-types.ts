// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type definitions for code execution feature.
 * These types are shared between Node (MCP server) and V8 (Live API adapter).
 */

// The user-facing note shape now lives in the notation layer (shared with the
// MIDI JSON notation). Re-exported here so code-exec callers keep their import.
import { type CodeNote } from "#src/notation/midi-json/midi-json-note.ts";

export { type CodeNote };

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
  path?: string; // where the clip is: "t0/s3", "t0", or "t0/l1"
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
