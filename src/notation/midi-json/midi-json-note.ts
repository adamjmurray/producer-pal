// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Pure note model shared by the code-execution feature and the MIDI JSON
 * notation. Holds the user-facing `CodeNote` shape plus the conversions between
 * it and the interpreter's internal `NoteEvent`. No Live API dependencies, so it
 * is safe to import from the notation layer and Node-only contexts.
 */

import { DEFAULT_VELOCITY } from "#src/notation/barbeat/barbeat-config.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { isValidMidi } from "#src/shared/pitch.ts";

/**
 * Note format exposed to user code and the MIDI JSON notation. Uses camelCase
 * and the clip's musical beats (an eighth in 6/8) — NOT Ableton's quarter-note
 * beats — so start/duration share a unit with `CodeExecutionContext.beatsPerBar`
 * and `CodeClipContext.length`.
 */
export interface CodeNote {
  pitch: number; // MIDI pitch 0-127
  start: number; // musical beats from clip start
  duration: number; // musical beats
  velocity: number; // 1-127 (0 only as MIDI JSON's delete marker, see validateAndSanitizeNote)
  velocityDeviation: number; // 0-127
  probability: number; // 0.0-1.0
}

/**
 * Convert internal NoteEvent to code-facing CodeNote format. Live's note times
 * are Ableton (quarter-note) beats; user code works in the clip's musical beats
 * (an eighth in 6/8) to match `context.beatsPerBar` and the rest of Producer Pal
 * — so scale by `denominator / 4`.
 *
 * @param event - Internal NoteEvent with snake_case properties
 * @param timeSigDenominator - Clip time-signature denominator
 * @returns CodeNote with camelCase properties
 */
export function noteEventToCodeNote(
  event: NoteEvent,
  timeSigDenominator: number,
): CodeNote {
  const toMusical = timeSigDenominator / 4;

  return {
    pitch: event.pitch,
    start: event.start_time * toMusical,
    duration: event.duration * toMusical,
    velocity: event.velocity,
    velocityDeviation: event.velocity_deviation ?? 0,
    probability: event.probability ?? 1,
  };
}

/**
 * Convert code-facing CodeNote to internal NoteEvent format. Inverse of
 * {@link noteEventToCodeNote}: musical beats back to Ableton (quarter-note)
 * beats via `4 / denominator`.
 *
 * @param note - CodeNote with camelCase properties
 * @param timeSigDenominator - Clip time-signature denominator
 * @returns Internal NoteEvent with snake_case properties
 */
export function codeNoteToNoteEvent(
  note: CodeNote,
  timeSigDenominator: number,
): NoteEvent {
  const toAbleton = 4 / timeSigDenominator;

  return {
    pitch: note.pitch,
    start_time: note.start * toAbleton,
    duration: note.duration * toAbleton,
    velocity: note.velocity,
    velocity_deviation: note.velocityDeviation,
    probability: note.probability,
  };
}

/**
 * Result of validating a raw value as a notes array. Either the sanitized notes
 * or an error message describing why the value was rejected.
 */
export type ValidateCodeNotesResult =
  | { success: true; notes: CodeNote[] }
  | { success: false; error: string };

/**
 * Validate a raw value (parsed user code result or MIDI JSON) as a notes array.
 * Filters out invalid notes and clamps values to valid ranges.
 *
 * @param result - Raw value to validate
 * @returns Validated result
 */
export function validateCodeNotes(result: unknown): ValidateCodeNotesResult {
  if (!Array.isArray(result)) {
    return {
      success: false,
      error: `Code must return an array of notes, got ${typeof result}`,
    };
  }

  const validatedNotes: CodeNote[] = [];

  for (const note of result) {
    const validated = validateAndSanitizeNote(note);

    if (validated.valid) {
      validatedNotes.push(validated.note);
    }
    // Invalid notes are silently filtered out
  }

  return { success: true, notes: validatedNotes };
}

/** Options for {@link validateAndSanitizeNote}. */
export interface ValidateNoteOptions {
  /**
   * Treat a velocity of 0 or less as a delete marker (MIDI JSON's `v:0`) and
   * keep it at 0 instead of clamping it up to 1, matching the transform rule
   * that `velocity <= 0` deletes. Off by default: user code returns notes to
   * play, and Live rejects velocity 0.
   */
  allowVelocityZero?: boolean;
}

/**
 * Validate and sanitize a single note.
 * Returns a valid note with clamped values, or invalid if note is malformed.
 *
 * @param note - The note object to validate
 * @param options - Validation options
 * @returns Valid note with sanitized values, or invalid marker
 */
export function validateAndSanitizeNote(
  note: unknown,
  options: ValidateNoteOptions = {},
): { valid: true; note: CodeNote } | { valid: false } {
  if (typeof note !== "object" || note == null) {
    return { valid: false };
  }

  const n = note as Record<string, unknown>;

  // Check required properties exist and are numbers
  if (typeof n.pitch !== "number" || typeof n.start !== "number") {
    return { valid: false };
  }

  // Reject non-finite pitch/start. A MIDI JSON div-by-zero ratio (p:5/0 →
  // Infinity, p:0/0 → NaN) is typeof "number" but would otherwise survive
  // clamping (Math.max/min pass NaN through) and reach add_new_notes.
  if (!Number.isFinite(n.pitch) || !Number.isFinite(n.start)) {
    return { valid: false };
  }

  // Default duration, velocity, and probability if not provided
  const duration = typeof n.duration === "number" ? n.duration : 1;
  const velocity =
    typeof n.velocity === "number" ? n.velocity : DEFAULT_VELOCITY;
  const probability = n.probability == null ? 1 : Number(n.probability);

  // Validate ranges (start can be negative for notes before clip start). A
  // div-by-zero ratio in any num/den field (d:5/0 → Infinity, v:0/0 → NaN,
  // c:0/0 → NaN) is typeof "number" but slips past the range checks below —
  // `<= 0` misses Infinity/NaN and Math.max/min pass NaN through — so reject any
  // non-finite value before it reaches add_new_notes. (velocityDeviation is
  // already coerced with `|| 0` below.)
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(velocity) ||
    !Number.isFinite(probability)
  ) {
    return { valid: false };
  }

  // Tested on the RAW velocity, before rounding: a quiet fractional velocity
  // (v:0.4, or a v:1/3 ratio) must stay a note, not round down into a deletion.
  const isDeleteMarker = options.allowVelocityZero === true && velocity <= 0;

  // A marker names a note that already exists, so an out-of-range pitch names
  // nothing — clamping it into 0-127 would delete a note the caller never
  // mentioned. Rounding is still fine: p:127.4 means 127.
  if (isDeleteMarker && !isValidMidi(Math.round(n.pitch))) {
    console.warn(
      `ignoring MIDI JSON delete marker: pitch ${n.pitch} is outside 0-127`,
    );

    return { valid: false };
  }

  // Sanitize by clamping values
  const sanitized: CodeNote = {
    pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
    start: n.start,
    duration: Math.max(0.001, duration),
    velocity: isDeleteMarker
      ? 0
      : Math.max(1, Math.min(127, Math.round(velocity))),
    velocityDeviation: Math.max(
      0,
      Math.min(127, Math.round(Number(n.velocityDeviation) || 0)),
    ),
    probability: Math.max(0, Math.min(1, probability)),
  };

  return { valid: true, note: sanitized };
}
