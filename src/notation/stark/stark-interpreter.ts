// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation interpreter: converts a Stark expression into MIDI note events.
 * Stark is a literal, round-trippable notation — pitches are exact (no scale
 * snapping), accidentals are explicit, durations are absolute /N note values.
 *
 * Two timing models coexist, but both are event-based (duration is explicit /N):
 *   Drums:                  a line of hit/rest tokens at a fixed pitch.
 *   Bass / melody / chords: pitched tokens.
 *
 * See parser/stark-grammar.peggy for the syntax.
 */

import { dedupeNotesKeepingLast, sortNotes } from "#src/notation/note-sort.ts";
import {
  type DrumSection,
  type PitchedContentItem,
  type PitchedSection,
  type StarkDynamic,
  type StarkSection,
} from "#src/notation/stark/parser/stark-parser.ts";
import * as parser from "#src/notation/stark/parser/stark-parser.ts";
import {
  BASS_REGISTER_DEFAULT,
  CHORDS_REGISTER_DEFAULT,
  DRUM_DEFAULT_N,
  durationBeats,
  LINE_DEFAULT_N,
  MELODY_REGISTER_DEFAULT,
  randomVelocity,
  VELOCITY_ACCENT_MAX,
  VELOCITY_ACCENT_MIN,
  VELOCITY_NORMAL_MAX,
  VELOCITY_NORMAL_MIN,
  VELOCITY_SOFT_MAX,
  VELOCITY_SOFT_MIN,
} from "#src/notation/stark/stark-config.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";

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

export interface StarkInterpretOptions {
  /** Time signature numerator (beats per bar). Accepted for parity; unused (timing is explicit). */
  timeSigNumerator?: number;
}

/**
 * Convert a Stark notation string into MIDI note events.
 * @param starkExpression - Stark notation string
 * @param _options - Interpretation options (timeSigNumerator accepted but unused)
 * @returns Array of note events sorted by start_time
 */
export function interpretNotation(
  starkExpression: string,
  _options: StarkInterpretOptions = {},
): NoteEvent[] {
  if (!starkExpression || starkExpression.trim() === "") {
    return [];
  }

  let ast;

  try {
    ast = parser.parse(starkExpression);
  } catch (error) {
    throw new Error(`Stark notation parse error: ${(error as Error).message}`, {
      cause: error,
    });
  }

  // Warn on mixed section types (drums + melody etc in one clip is unusual).
  const sectionKinds = new Set(
    ast.map((s) => ("midi" in s ? "drums" : s.type)),
  );

  if (sectionKinds.size > 1) {
    console.warn(
      `Stark: mixed section types (${[...sectionKinds].join(", ")}) in one clip`,
    );
  }

  const notes: NoteEvent[] = [];

  for (const section of ast) {
    if (isDrumSection(section)) {
      processDrumSection(section, notes);
    } else {
      processPitchedSection(section, notes);
    }
  }

  // Resolve same-pitch+start collisions (can arise from mixed sections).
  const deduped = dedupeNotesKeepingLast(notes);
  const collisions = notes.length - deduped.length;

  if (collisions > 0) {
    console.warn(
      `Stark: ${collisions} same-pitch+start ${collisions === 1 ? "collision" : "collisions"} from mixed sections; keeping last note`,
    );
  }

  return sortNotes(deduped);
}

// Drum sections carry a `midi`/`noteName` header; pitched sections do not.
function isDrumSection(section: StarkSection): section is DrumSection {
  return "midi" in section;
}

// Process an event-based drum section: each token is a hit or rest whose
// duration is its glued /N, else the line default (header /N, else /4). The
// pitch is fixed — the named drum's GM pitch (section.midi) or a pitch-name
// header resolved via pitch.ts (Ableton C3=60).
function processDrumSection(section: DrumSection, notes: NoteEvent[]): void {
  const pitch =
    section.midi ??
    (section.noteName ? noteNameToMidi(section.noteName) : null);

  if (pitch == null) {
    console.warn(
      `Stark: drum line "${section.type}" has no resolvable pitch — skipping`,
    );

    return;
  }

  const lineDefaultN = section.defaultDuration ?? DRUM_DEFAULT_N;

  let time = 0;

  for (const item of section.content) {
    if ("barMarker" in item) continue;

    const beats = durationBeats(item.duration ?? lineDefaultN);

    if (item.type === "rest") {
      time += beats;
      continue;
    }

    notes.push({
      pitch,
      start_time: time,
      duration: beats,
      velocity: velocityFor(item.velocity),
      probability: 1.0,
    });
    time += beats;
  }
}

// Convert a dynamic level to a random velocity within its range.
function velocityFor(dynamic: StarkDynamic): number {
  if (dynamic === "accent")
    return randomVelocity(VELOCITY_ACCENT_MIN, VELOCITY_ACCENT_MAX);
  if (dynamic === "soft")
    return randomVelocity(VELOCITY_SOFT_MIN, VELOCITY_SOFT_MAX);

  return randomVelocity(VELOCITY_NORMAL_MIN, VELOCITY_NORMAL_MAX);
}

// Compute semitone offset from the register's C for a note letter + accidental.
function pitchOffset(letter: string, accidental: "#" | "b" | null): number {
  const base = NATURAL_PC[letter] ?? 0;

  if (accidental === "#") return base + 1;
  if (accidental === "b") return base - 1;

  return base;
}

// Process a pitched section (bass/melody/chords): event-based timing, /N
// durations. Pushes the section's notes onto `notes`.
function processPitchedSection(
  section: PitchedSection,
  notes: NoteEvent[],
): void {
  const registerDefault =
    section.type === "bass"
      ? BASS_REGISTER_DEFAULT
      : section.type === "melody"
        ? MELODY_REGISTER_DEFAULT
        : CHORDS_REGISTER_DEFAULT;

  const lineDefaultN = section.defaultDuration ?? LINE_DEFAULT_N[section.type];

  let time = 0;

  for (const item of section.content) {
    time = processItem(item, time, registerDefault, lineDefaultN, notes);
  }
}

// Process one pitched content item; returns updated time cursor.
function processItem(
  item: PitchedContentItem,
  time: number,
  registerDefault: number,
  lineDefaultN: number,
  notes: NoteEvent[],
): number {
  if ("barMarker" in item) return time;

  if (item.type === "rest") {
    return time + durationBeats(item.duration ?? lineDefaultN);
  }

  if (item.type === "note") {
    const beats = durationBeats(item.duration ?? lineDefaultN);
    const midi = clampMidi(
      registerDefault +
        pitchOffset(item.letter, item.accidental) +
        item.octaveShift * 12,
    );

    notes.push({
      pitch: midi,
      start_time: time,
      duration: beats,
      velocity: velocityFor(item.dynamic),
      probability: 1.0,
    });

    return time + beats;
  }

  // type === "chord"
  const beats = durationBeats(item.duration ?? lineDefaultN);
  const vel = velocityFor(item.dynamic);

  for (const chordNote of item.notes) {
    const midi = clampMidi(
      registerDefault +
        pitchOffset(chordNote.letter, chordNote.accidental) +
        chordNote.octaveShift * 12,
    );

    notes.push({
      pitch: midi,
      start_time: time,
      duration: beats,
      velocity: vel,
      probability: 1.0,
    });
  }

  return time + beats;
}

// Clamp a computed pitch to the valid MIDI range.
function clampMidi(midi: number): number {
  return Math.max(0, Math.min(127, midi));
}
