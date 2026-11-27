// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Pure note model shared by the code-execution feature and the MIDI JSON
 * notation. Holds the user-facing `CodeNote` shape plus the conversions between
 * it and the interpreter's internal `NoteEvent`. No Live API dependencies, so it
 * is safe to import from the notation layer and Node-only contexts.
 */

import { DEFAULT_VELOCITY } from "#src/notation/barbeat/barbeat-config.ts";
import { type NoteEvent } from "#src/notation/types.ts";
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
  velocityDeviation: number; // -127 to 127
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

type NoteKeys = Record<keyof CodeNote, string>;

const SHORT_KEYS: NoteKeys = {
  pitch: "p",
  start: "t",
  duration: "d",
  velocity: "v",
  velocityDeviation: "vd",
  probability: "c",
};

const LONG_KEYS: NoteKeys = {
  pitch: "pitch",
  start: "start",
  duration: "duration",
  velocity: "velocity",
  velocityDeviation: "velocityDeviation",
  probability: "probability",
};

/**
 * Result of validating a raw value as a notes array. Either the sanitized notes
 * or an error message describing why the value was rejected.
 */
export type ValidateCodeNotesResult =
  | { success: true; notes: CodeNote[]; dropped: string[]; clamped: string[] }
  | { success: false; error: string };

/**
 * Validate the value user code returned as a notes array. Filters out invalid
 * notes and clamps values to valid ranges, listing both for the caller to warn
 * about.
 *
 * @param result - Raw value to validate
 * @returns The valid notes, plus why notes were dropped and what was clamped
 */
export function validateCodeNotes(result: unknown): ValidateCodeNotesResult {
  if (!Array.isArray(result)) {
    return {
      success: false,
      error: `Code must return an array of notes, got ${typeof result}`,
    };
  }

  const notes: CodeNote[] = [];
  const dropped: string[] = [];
  const clamped: string[] = [];

  for (const note of result) {
    const validated = validateAndSanitizeNote(note, { longKeys: true });

    if (validated.valid) {
      notes.push(validated.note);
      clamped.push(...validated.clamped);
    } else {
      dropped.push(validated.reason);
    }
  }

  return { success: true, notes, dropped, clamped };
}

/** Options for {@link validateAndSanitizeNote}. */
export interface ValidateNoteOptions {
  /**
   * Treat a velocity of 0 or less as a delete marker (MIDI JSON's `v:0`) and
   * keep it at 0 instead of clamping it up to 1, matching the transform rule
   * that `velocity <= 0` deletes. Off by default: user code returns notes to
   * play, and Live rejects velocity 0, so it is clamped up to 1.
   */
  allowVelocityZero?: boolean;
  /**
   * Name fields in reasons by a code note's long keys (`pitch`, `velocity`)
   * instead of MIDI JSON's short ones (`p`, `v`).
   */
  longKeys?: boolean;
}

/**
 * Validate and sanitize a single note.
 * Returns a valid note with clamped values, or invalid if note is malformed or
 * its pitch is outside 0-127: a clamped pitch is a note nobody wrote.
 *
 * An invalid result carries a short `reason`; a valid one lists what was
 * `clamped`. Callers decide whether to report them: {@link interpretMidiJson}
 * aggregates each into one warning, since changing or dropping a note the
 * caller asked for should never be silent. Both are phrased for a model reading
 * a `WARNING:` block, so they name the keys the caller wrote.
 *
 * @param note - The note object to validate
 * @param options - Validation options
 * @returns Valid note with sanitized values and what was clamped, or invalid
 *   plus the reason why
 */
export function validateAndSanitizeNote(
  note: unknown,
  options: ValidateNoteOptions = {},
):
  | { valid: true; note: CodeNote; clamped: string[] }
  | { valid: false; reason: string } {
  if (typeof note !== "object" || note == null) {
    return { valid: false, reason: "not an object" };
  }

  const n = note as Record<string, unknown>;
  const key = options.longKeys === true ? LONG_KEYS : SHORT_KEYS;

  if (!hasPitchAndStart(n)) {
    return {
      valid: false,
      reason: `missing or non-numeric ${key.pitch}/${key.start}`,
    };
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
    !Number.isFinite(velocity) ||
    !Number.isFinite(probability)
  ) {
    return {
      valid: false,
      reason: `non-finite ${key.duration}, ${key.velocity}, or ${key.probability}`,
    };
  }

  // Tested on the RAW velocity, before rounding: a quiet fractional velocity
  // (v:0.4, or a v:1/3 ratio) must stay a note, not round down into a deletion.
  const isDeleteMarker = options.allowVelocityZero === true && velocity <= 0;

  // A zero/negative duration is only meaningless for a real note. A marker names
  // a note that already exists, so `d:0` must still delete instead of being
  // dropped here — the marker is filtered out before the write either way.
  if (!isDeleteMarker && duration <= 0) {
    return { valid: false, reason: `${key.duration} must be greater than 0` };
  }

  // Never clamped: that would write a note nobody asked for, or (for a marker)
  // delete one the caller never mentioned. Rounding is fine: p:127.4 means 127.
  if (!isValidMidi(Math.round(n.pitch))) {
    return {
      valid: false,
      reason: `${isDeleteMarker ? "delete marker " : ""}pitch ${n.pitch} is outside 0-127`,
    };
  }

  // Sanitize by clamping values, noting each one that moved
  const clamped: string[] = [];

  const clamp = (
    name: string,
    value: number,
    min: number,
    max: number,
  ): number => {
    if (value >= min && value <= max) {
      return value;
    }

    clamped.push(`${name} outside ${min} to ${max}`);

    return Math.max(min, Math.min(max, value));
  };

  const sanitized: CodeNote = {
    pitch: Math.round(n.pitch),
    start: n.start,
    duration: Math.max(0.001, duration),
    velocity: isDeleteMarker
      ? 0
      : clamp(key.velocity, Math.round(velocity), 1, 127),
    velocityDeviation: clamp(
      key.velocityDeviation,
      Math.round(Number(n.velocityDeviation) || 0),
      -127,
      127,
    ),
    probability: clamp(key.probability, probability, 0, 1),
  };

  return { valid: true, note: sanitized, clamped };
}

/**
 * Whether a raw note object carries the two required fields as usable numbers.
 * `Number.isFinite` is the whole check: it never coerces, so a non-number fails
 * it — which is what makes the type predicate sound without a `typeof` pass.
 * It also rejects a MIDI JSON div-by-zero ratio (p:5/0 → Infinity, p:0/0 → NaN),
 * typeof "number" but able to survive clamping (Math.max/min pass NaN through)
 * and reach add_new_notes.
 * @param n - Raw note object
 * @returns True when pitch and start are both finite numbers
 */
function hasPitchAndStart(
  n: Record<string, unknown>,
): n is Record<string, unknown> & { pitch: number; start: number } {
  return Number.isFinite(n.pitch) && Number.isFinite(n.start);
}
