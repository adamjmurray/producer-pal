// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type definitions for code execution feature.
 * These types are shared between Node (MCP server) and V8 (Live API adapter).
 */

/**
 * Note format exposed to user code.
 * Uses camelCase and beats from clip start (not Ableton's quarter-note beats).
 */
export interface CodeNote {
  pitch: number; // MIDI pitch 0-127
  start: number; // beats from clip start
  duration: number; // beats
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
  length: number; // beats
  timeSignature: string; // e.g., "4/4"
  looping: boolean;
}

/**
 * Location context passed to user code.
 */
export interface CodeLocationContext {
  view: "session" | "arrangement";
  sceneIndex?: number; // session only
  arrangementStart?: number; // arrangement only, in beats
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
  beatsPerBar: number; // convenience for math
}

/**
 * Result of code execution.
 * Either transformed notes or an error message.
 */
export type CodeExecutionResult =
  | { success: true; notes: CodeNote[] }
  | { success: false; error: string };

/**
 * Protocol message: V8 → Node with extracted notes and context.
 */
export interface NotesDataMessage {
  requestId: string;
  clips: Array<{
    clipId: string;
    notes: CodeNote[];
  }>;
  context: CodeExecutionContext;
}

/**
 * Protocol message: Node → V8 with transformed notes.
 */
export interface ApplyNotesMessage {
  requestId: string;
  clips: Array<{
    clipId: string;
    notes: CodeNote[];
  }>;
}

/** Maximum clips allowed when code execution is used */
export const MAX_CODE_EXEC_CLIPS = 20;

/** Timeout for code execution per clip (milliseconds) */
export const CODE_EXEC_TIMEOUT_MS = 2000;
