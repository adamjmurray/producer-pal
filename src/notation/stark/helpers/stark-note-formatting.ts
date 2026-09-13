// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Token-level spelling for the Stark serializer: pitched-line classification,
 * note grouping, pitch parts, octave marks, drum header/char, dynamic suffix.
 * Nothing here knows about the line-default factoring the serializer layers on
 * top.
 */

import { sortNotes } from "#src/notation/note-sort.ts";
import {
  BASS_REGISTER_DEFAULT,
  MELODY_REGISTER_DEFAULT,
  MIDI_TO_DRUM_NAME,
  VELOCITY_ACCENT_THRESHOLD,
  VELOCITY_SOFT_THRESHOLD,
} from "#src/notation/stark/stark-config.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { midiToNoteName, PITCH_CLASS_NAMES } from "#src/shared/pitch.ts";

/** A pitched line classified for serialization: a bass/melody line by register. */
export interface PitchedClassification {
  lineType: "bass" | "melody";
  registerDefault: number;
  sorted: NoteEvent[];
}

/**
 * Sort notes and classify the line as bass or melody by median pitch, with its
 * register default. Simultaneous notes (chords) are serialized as [..] bracket
 * stacks on whichever line the median picks — chord SYMBOLS are input-only, so
 * read-back is always literal notes on a melody/bass line, never a `chords:` line.
 * @param notes - Note events to classify
 * @returns The classification plus the start-sorted notes
 */
export function classifyPitchedLine(notes: NoteEvent[]): PitchedClassification {
  // Sort by (start_time, pitch) — the interpreter's canonical order (sortNotes)
  // — so a simultaneous group serializes to a pitch-ascending [..] stack
  // regardless of input order. A start-only sort left the bracket order at the
  // mercy of the caller's ordering, so re-serializing the interpreter's
  // (pitch-sorted) output produced a different string — a fixpoint break.
  const sorted = sortNotes(notes);
  const pitches = sorted.map((n) => n.pitch).toSorted((a, b) => a - b);
  const medianPitch = pitches[Math.floor(pitches.length / 2)] ?? 60;
  const lineType = medianPitch < 48 ? "bass" : "melody";
  const registerDefault =
    lineType === "bass" ? BASS_REGISTER_DEFAULT : MELODY_REGISTER_DEFAULT;

  return { lineType, registerDefault, sorted };
}

/**
 * Group start-sorted notes into runs of simultaneous notes (same start_time
 * within epsilon). Each group is non-empty and preserves input order.
 * @param sorted - Notes already sorted by start_time
 * @returns Array of simultaneous-note groups
 */
export function groupSimultaneousNotes(sorted: NoteEvent[]): NoteEvent[][] {
  const groups: NoteEvent[][] = [];
  let i = 0;

  while (i < sorted.length) {
    // i < sorted.length above guarantees this access is valid.
    const groupStart = (sorted[i] as NoteEvent).start_time;
    const group: NoteEvent[] = [];

    while (
      i < sorted.length &&
      Math.abs((sorted[i] as NoteEvent).start_time - groupStart) <
        SAME_TIME_EPSILON
    ) {
      group.push(sorted[i] as NoteEvent);
      i++;
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Group notes by MIDI pitch, preserving first-seen pitch order.
 * @param notes - Note events to group
 * @returns Map from MIDI pitch to its notes, in first-seen order
 */
export function groupNotesByPitch(
  notes: NoteEvent[],
): Map<number, NoteEvent[]> {
  const byPitch = new Map<number, NoteEvent[]>();

  for (const note of notes) {
    const existing = byPitch.get(note.pitch);

    if (existing) {
      existing.push(note);
    } else {
      byPitch.set(note.pitch, [note]);
    }
  }

  return byPitch;
}

/**
 * Choose a drum line header: the readable drum name (kick/snare/…) when one maps
 * to the pitch, else an absolute pitch name (e.g. "C3", Ableton C3=60) — so any
 * Drum-Rack pad round-trips, no drops.
 * @param midi - MIDI pitch of the drum note
 * @returns The header token (drum name or absolute pitch name)
 */
export function drumHeader(midi: number): string {
  // midiToNoteName only returns null for out-of-range MIDI; NoteEvent pitches
  // are always 0–127, so the fallback is safe to assert non-null.
  return MIDI_TO_DRUM_NAME[midi] ?? (midiToNoteName(midi) as string);
}

/**
 * Map a velocity to its drum character (^ accent / X normal / x soft).
 * @param velocity - MIDI velocity
 * @returns The drum hit character
 */
export function drumChar(velocity: number): string {
  if (velocity >= VELOCITY_ACCENT_THRESHOLD) {
    return "^";
  }

  if (velocity >= VELOCITY_SOFT_THRESHOLD) {
    return "X";
  }

  return "x";
}

/**
 * Decompose a MIDI pitch into a letter + accidental + octave shift relative to a
 * register default (the MIDI value that a bare C maps to in that line).
 * @param midi - MIDI pitch
 * @param registerDefault - MIDI value a bare C maps to for this line
 * @returns The pitch letter, accidental ("b" or ""), and octave shift
 */
export function pitchParts(
  midi: number,
  registerDefault: number,
): { letter: string; accidental: string; octaveShift: number } {
  const pitchClass = ((midi % 12) + 12) % 12;
  // PITCH_CLASS_NAMES uses flats: C, Db, D, Eb, E, F, Gb, G, Ab, A, Bb, B.
  // pitchClass is 0-11 by construction, so the lookup always hits a 1-2 char name.
  const name = PITCH_CLASS_NAMES[pitchClass] as string;
  const letter = name.at(0) as string;
  const accidental = name.length > 1 ? "b" : "";
  // The "natural" MIDI position for this pitch class in the register
  const naturalMidi = registerDefault + pitchClass;
  const octaveShift = Math.round((midi - naturalMidi) / 12);

  return { letter, accidental, octaveShift };
}

/**
 * Build an octave-mark string from a shift count ("'" up, "," down).
 * @param shift - Octave shift (positive = up, negative = down)
 * @returns The octave-mark string ("" when shift is 0)
 */
export function octaveMarks(shift: number): string {
  if (shift > 0) {
    return "'".repeat(shift);
  }

  if (shift < 0) {
    return ",".repeat(-shift);
  }

  return "";
}

/**
 * Map a velocity to its dynamic suffix ("!" accent / "" normal / "?" soft).
 * @param velocity - MIDI velocity
 * @returns The dynamic suffix
 */
export function dynamicSuffix(velocity: number): string {
  if (velocity >= VELOCITY_ACCENT_THRESHOLD) {
    return "!";
  }

  if (velocity >= VELOCITY_SOFT_THRESHOLD) {
    return "";
  }

  return "?";
}
