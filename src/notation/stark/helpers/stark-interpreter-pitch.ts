// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Pitch resolution for the Stark interpreter: turning a token's letter,
 * accidental, and octave (absolute number and/or `'`/`,` marks) into MIDI.
 */

import { assertDefined } from "#src/shared/error-message.ts";
import { emitWarning } from "#src/shared/max/v8-max-console.ts";
import { isValidMidi } from "#src/shared/pitch.ts";

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
 * @returns MIDI pitch, or null when it lands out of range
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

  const midi =
    registerDefault +
    pitchOffset(note.letter, note.accidental) +
    note.octaveShift * 12;

  return isValidMidi(midi) ? midi : null;
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
 * Re-spell a token for a warning message.
 * @param note - The token's spelling
 * @returns The token as written
 */
export function noteLabel(note: StarkPitchSpelling): string {
  const marks = octaveMarks(note.octaveShift);

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

  if (accidental === "#") {
    return base + 1;
  }

  if (accidental === "b") {
    return base - 1;
  }

  return base;
}

/**
 * The pitches of a chord symbol Live can play. The rest are skipped with a
 * warning, like a single note: clamping one would add a note nobody wrote.
 * @param pitches - The chord's pitches, in or out of range
 * @param chord - The symbol as parsed, to name it
 * @param chord.root - Root pitch-class name
 * @param chord.quality - Quality as written
 * @param chord.bass - Slash-bass name, or null
 * @param chord.octaveShift - Whole-chord octave displacement
 * @returns The pitches in 0-127
 */
export function playableChordPitches(
  pitches: number[],
  chord: {
    root: string;
    quality: string;
    bass: string | null;
    octaveShift: number;
  },
): number[] {
  const playable = pitches.filter((pitch) => isValidMidi(pitch));
  const skipped = pitches.length - playable.length;

  if (skipped > 0) {
    const slash = chord.bass == null ? "" : `/${chord.bass}`;
    const label = `${chord.root}${chord.quality}${slash}${octaveMarks(chord.octaveShift)}`;

    emitWarning(
      `Stark: chord "${label}" has ${skipped} note${skipped === 1 ? "" : "s"} out of MIDI range — skipping`,
    );
  }

  return playable;
}

// The octave marks for a shift, as written: `'` up, `,` down.
function octaveMarks(shift: number): string {
  return shift >= 0 ? "'".repeat(shift) : ",".repeat(-shift);
}
