// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CodeExecutionResult, type CodeNote } from "../code-exec-types.ts";

/**
 * Create a CodeNote fixture (camelCase format returned by executeNoteCode).
 * @param pitch - MIDI pitch
 * @param start - Start time in beats
 * @param opts - Optional overrides for duration, velocity, velocityDeviation, probability
 * @returns CodeNote object
 */
export function codeNote(
  pitch: number,
  start = 0,
  opts: Partial<
    Pick<
      CodeNote,
      "duration" | "velocity" | "velocityDeviation" | "probability"
    >
  > = {},
): CodeNote {
  return {
    pitch,
    start,
    duration: opts.duration ?? 1,
    velocity: opts.velocity ?? 100,
    velocityDeviation: opts.velocityDeviation ?? 0,
    probability: opts.probability ?? 1,
  };
}

interface LiveApiNote {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  velocity_deviation: number;
  probability: number;
}

/**
 * Convert a CodeNote to Live API note format (snake_case for add_new_notes).
 * @param cn - CodeNote to convert
 * @returns Live API note object
 */
export function toLiveApiNote(cn: CodeNote): LiveApiNote {
  return {
    pitch: cn.pitch,
    start_time: cn.start,
    duration: cn.duration,
    velocity: cn.velocity,
    velocity_deviation: cn.velocityDeviation,
    probability: cn.probability,
  };
}

/**
 * Create a successful CodeExecutionResult with the given notes.
 * @param notes - CodeNote array
 * @returns Success result for executeNoteCode mock
 */
export function codeExecSuccess(notes: CodeNote[]): CodeExecutionResult {
  return { success: true, notes };
}

/**
 * Create a failed CodeExecutionResult with the given error.
 * @param error - Error message
 * @returns Failure result for executeNoteCode mock
 */
export function codeExecFailure(error: string): CodeExecutionResult {
  return { success: false, error };
}
