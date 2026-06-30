// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Abstark notation interpreter: converts an Abstark expression into MIDI note
 * events. Abstark is a literal, round-trippable notation — pitches are exact
 * (no scale snapping), accidentals are explicit, durations are absolute /N note
 * values. See parser/abstark-grammar.peggy for syntax.
 *
 * Two timing models coexist:
 *   Drums:              positional — each DrumToken = one 16th-note step.
 *   Bass / melody / chords: event-based — duration is explicit /N.
 */

import {
  BASS_REGISTER_DEFAULT,
  CHORDS_REGISTER_DEFAULT,
  durationBeats,
  LINE_DEFAULT_N,
  MELODY_REGISTER_DEFAULT,
  randomVelocity,
  SIXTEENTH_NOTE_BEATS,
  VELOCITY_ACCENT_MAX,
  VELOCITY_ACCENT_MIN,
  VELOCITY_NORMAL_MAX,
  VELOCITY_NORMAL_MIN,
  VELOCITY_SOFT_MAX,
  VELOCITY_SOFT_MIN,
} from "#src/notation/abstark/abstark-config.ts";
import {
  type AbstarkDynamic,
  type DrumSection,
  type PitchedSection,
  type PitchedContentItem,
} from "#src/notation/abstark/parser/abstark-parser.ts";
import * as parser from "#src/notation/abstark/parser/abstark-parser.ts";
import { dedupeNotesKeepingLast, sortNotes } from "#src/notation/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";

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

export interface AbstarkInterpretOptions {
  /** Time signature numerator (beats per bar). Not used for timing, only for context. */
  timeSigNumerator?: number;
}

/**
 * Convert an Abstark notation string into MIDI note events.
 * @param abstarkExpression - Abstark notation string
 * @param _options - Interpretation options (timeSigNumerator accepted but unused)
 * @returns Array of note events sorted by start_time
 */
export function interpretNotation(
  abstarkExpression: string,
  _options: AbstarkInterpretOptions = {},
): NoteEvent[] {
  if (!abstarkExpression || abstarkExpression.trim() === "") {
    return [];
  }

  let ast;

  try {
    ast = parser.parse(abstarkExpression);
  } catch (error) {
    throw new Error(
      `Abstark notation parse error: ${(error as Error).message}`,
      { cause: error },
    );
  }

  // Warn on mixed section types (drums + melody etc in one clip is unusual).
  const sectionKinds = new Set(
    ast.map((s) => ("midi" in s ? "drums" : s.type)),
  );

  if (sectionKinds.size > 1) {
    console.warn(
      `Abstark: mixed section types (${[...sectionKinds].join(", ")}) in one clip`,
    );
  }

  const notes: NoteEvent[] = [];

  for (const section of ast) {
    if ("midi" in section) {
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
      `Abstark: ${collisions} same-pitch+start ${collisions === 1 ? "collision" : "collisions"} from mixed sections; keeping last note`,
    );
  }

  return sortNotes(deduped);
}

// Convert dynamic level to a random velocity within its range.
function velocityFor(dynamic: AbstarkDynamic): number {
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

// Process a drum section: each token is one 16th-note step; barlines are visual only.
function processDrumSection(section: DrumSection, notes: NoteEvent[]): void {
  let time = 0;

  for (const item of section.content) {
    if ("barMarker" in item) continue;

    if (item.type === "rest") {
      time += SIXTEENTH_NOTE_BEATS;
      continue;
    }

    notes.push({
      pitch: section.midi,
      start_time: time,
      duration: SIXTEENTH_NOTE_BEATS,
      velocity: velocityFor(item.velocity),
      probability: 1.0,
    });
    time += SIXTEENTH_NOTE_BEATS;
  }
}

// Process a pitched section (bass/melody/chords): event-based timing, /N durations.
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
    const midi = Math.max(
      0,
      Math.min(
        127,
        registerDefault +
          pitchOffset(item.letter, item.accidental) +
          item.octaveShift * 12,
      ),
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
    const midi = Math.max(
      0,
      Math.min(
        127,
        registerDefault +
          pitchOffset(chordNote.letter, chordNote.accidental) +
          chordNote.octaveShift * 12,
      ),
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
