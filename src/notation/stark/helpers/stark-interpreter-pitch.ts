// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Pitch resolution for the Stark interpreter: turning a token's letter,
 * accidental, and octave (absolute number and/or `'`/`,` marks) into MIDI.
 */

import { assertDefined } from "#src/shared/error-utils.ts";

/** A pitched token's spelling, as the grammar produces it. */
export interface StarkPitchSpelling {
  letter: string;
  accidental: "#" | "b" | null;
  /** Absolute octave (`C3` = 60), or null to use the line register. */
  octave: number | null;
  /** Net displacement from `'`/`,` marks. */
  octaveShift: number;
}

/** Natural pitch class offsets (semitones above C). */
const NATURAL_PC: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Resolve one literal pitched token (a note or a bracket-chord note) to MIDI.
 * An absolute octave pins the pitch; without one the pitch is placed relative to
 * the line's register default.
 * @param note - The token's spelling
 * @param registerDefault - MIDI pitch a bare `C` maps to on this line
 * @returns MIDI pitch, or null when an absolute octave lands out of range
 *   (register-relative pitches clamp instead)
 */
export function notePitch(
  note: StarkPitchSpelling,
  registerDefault: number,
): number | null {
  if (note.octave != null) {
    return absolutePitch(
      note.letter,
      note.accidental,
      note.octave,
      note.octaveShift,
    );
  }

  return clampMidi(
    registerDefault +
      pitchOffset(note.letter, note.accidental) +
      note.octaveShift * 12,
  );
}

/**
 * Resolve a drum header's absolute pitch name (e.g. "Cb2", "F#3") to MIDI the
 * same arithmetic way note tokens do, so enharmonic spellings (Cb/E#/Fb/B#)
 * work.
 * @param noteName - Absolute pitch name from the header
 * @returns MIDI pitch (Ableton C3 = 60), or null if out of range (e.g. "C9")
 */
export function drumHeaderPitch(noteName: string): number | null {
  // The grammar's DrumPitchName is this same shape, so the anchored match always
  // succeeds → all three groups present (accidental is "" when absent).
  const match = assertDefined(
    noteName.match(/^([A-Ga-g])([#b]?)(-?\d+)$/),
    "drum pitch name shape",
  );
  const letter = (match[1] as string).toUpperCase();
  const accidental = match[2] === "#" ? "#" : match[2] === "b" ? "b" : null;

  return absolutePitch(
    letter,
    accidental,
    Number.parseInt(match[3] as string),
    0,
  );
}

/**
 * Re-spell a token for a warning message (only absolute-octave tokens can land
 * out of range, so the octave is always present in practice).
 * @param note - The token's spelling
 * @returns The token as written
 */
export function noteLabel(note: StarkPitchSpelling): string {
  const marks =
    note.octaveShift >= 0
      ? "'".repeat(note.octaveShift)
      : ",".repeat(-note.octaveShift);

  return `${note.letter}${note.accidental ?? ""}${note.octave ?? ""}${marks}`;
}

// MIDI for a pitch pinned by an absolute octave (Ableton C3 = 60), plus any
// octave marks. Null when the result falls outside MIDI range — a spelling like
// `C9` is a typo, so callers skip it rather than clamp it to a wrong pitch.
function absolutePitch(
  letter: string,
  accidental: "#" | "b" | null,
  octave: number,
  octaveShift: number,
): number | null {
  const midi =
    (octave + 2 + octaveShift) * 12 + pitchOffset(letter, accidental);

  return midi < 0 || midi > 127 ? null : midi;
}

// Semitone offset from the register's C for a note letter + accidental.
function pitchOffset(letter: string, accidental: "#" | "b" | null): number {
  // Callers pass an uppercased A-G letter, so the table lookup always hits.
  const base = NATURAL_PC[letter] as number;

  if (accidental === "#") return base + 1;
  if (accidental === "b") return base - 1;

  return base;
}

// Clamp a computed pitch to the valid MIDI range.
function clampMidi(midi: number): number {
  return Math.max(0, Math.min(127, midi));
}
