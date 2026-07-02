// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Leaf primitives for the Stark serializer: pitched-line classification, note
 * grouping, and the token-level spellers (pitch parts, octave marks, drum
 * header/char, dynamic suffix, rest decomposition). Kept out of
 * stark-serializer.ts so the main file stays under the line limit; nothing here
 * knows about the line-default factoring the serializer layers on top.
 */

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

/** A pitched line classified for serialization (chords vs. mono bass/melody). */
export type PitchedClassification =
  | { kind: "chords"; sorted: NoteEvent[] }
  | {
      kind: "mono";
      lineType: "bass" | "melody";
      registerDefault: number;
      sorted: NoteEvent[];
    };

/**
 * Sort notes and classify the line as chords (any simultaneous notes) or a
 * monophonic bass/melody line (by median pitch), with its register default.
 * @param notes - Note events to classify
 * @returns The classification plus the start-sorted notes
 */
export function classifyPitchedLine(notes: NoteEvent[]): PitchedClassification {
  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);

  // Detect simultaneous notes (same start_time within epsilon).
  const hasChords = sorted.some((note, i) => {
    const next = sorted[i + 1];

    return (
      next !== undefined &&
      Math.abs(note.start_time - next.start_time) < SAME_TIME_EPSILON
    );
  });

  if (hasChords) {
    return { kind: "chords", sorted };
  }

  // Monophonic — classify as bass or melody by median pitch.
  const pitches = sorted.map((n) => n.pitch).sort((a, b) => a - b);
  const medianPitch = pitches[Math.floor(pitches.length / 2)] ?? 60;
  const lineType = medianPitch < 48 ? "bass" : "melody";
  const registerDefault =
    lineType === "bass" ? BASS_REGISTER_DEFAULT : MELODY_REGISTER_DEFAULT;

  return { kind: "mono", lineType, registerDefault, sorted };
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
  if (velocity >= VELOCITY_ACCENT_THRESHOLD) return "^";
  if (velocity >= VELOCITY_SOFT_THRESHOLD) return "X";

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
  // PITCH_CLASS_NAMES uses flats: C, Db, D, Eb, E, F, Gb, G, Ab, A, Bb, B
  const name = PITCH_CLASS_NAMES[pitchClass] ?? "C";
  const letter = name[0] ?? "C";
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
  if (shift > 0) return "'".repeat(shift);
  if (shift < 0) return ",".repeat(-shift);

  return "";
}

/**
 * Map a velocity to its dynamic suffix ("!" accent / "" normal / "?" soft).
 * @param velocity - MIDI velocity
 * @returns The dynamic suffix
 */
export function dynamicSuffix(velocity: number): string {
  if (velocity >= VELOCITY_ACCENT_THRESHOLD) return "!";
  if (velocity >= VELOCITY_SOFT_THRESHOLD) return "";

  return "?";
}

/**
 * Decompose a gap into a greedy list of note-value denominators that fill it
 * (largest first: whole → half → quarter → 8th → 16th). A sub-16th remainder is
 * dropped (the off-16th snap the serializer documents).
 * @param gapBeats - Gap length in Ableton beats
 * @returns Note-value denominators (each an /N) summing to about the gap
 */
export function restNoteValues(gapBeats: number): number[] {
  const ns: number[] = [];
  const denominators = [1, 2, 4, 8, 16] as const;

  let remaining = gapBeats;

  for (const n of denominators) {
    const beats = 4 / n;

    while (remaining >= beats - SAME_TIME_EPSILON) {
      ns.push(n);
      remaining -= beats;
    }
  }

  return ns;
}
