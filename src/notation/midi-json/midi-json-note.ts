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
  velocity: number; // 1-127
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
  { success: true; notes: CodeNote[] } | { success: false; error: string };

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

/**
 * Validate and sanitize a single note.
 * Returns a valid note with clamped values, or invalid if note is malformed.
 *
 * @param note - The note object to validate
 * @returns Valid note with sanitized values, or invalid marker
 */
export function validateAndSanitizeNote(
  note: unknown,
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

  // Default duration and velocity if not provided
  const duration = typeof n.duration === "number" ? n.duration : 1;
  const velocity =
    typeof n.velocity === "number" ? n.velocity : DEFAULT_VELOCITY;

  // Validate ranges (start can be negative for notes before clip start). A
  // non-finite duration (d:5/0 → Infinity, d:0/0 → NaN) slips past `<= 0`, so
  // reject it explicitly before it reaches add_new_notes.
  if (!Number.isFinite(duration) || duration <= 0) {
    return { valid: false };
  }

  // Sanitize by clamping values
  const sanitized: CodeNote = {
    pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
    start: n.start,
    duration: Math.max(0.001, duration),
    velocity: Math.max(1, Math.min(127, Math.round(velocity))),
    velocityDeviation: Math.max(
      0,
      Math.min(127, Math.round(Number(n.velocityDeviation) || 0)),
    ),
    probability: Math.max(
      0,
      Math.min(1, n.probability == null ? 1 : Number(n.probability)),
    ),
  };

  return { valid: true, note: sanitized };
}
