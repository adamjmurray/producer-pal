// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation interpreter: converts a Stark expression into MIDI note events.
 * Stark is a literal, round-trippable notation — pitches are exact (no scale
 * snapping), accidentals are explicit, durations are absolute /N note values.
 *
 * Three line types coexist, all event-based (duration is explicit /N):
 *   Drums:         a line of hit/rest tokens at a fixed pitch.
 *   Melody / bass: literal pitched tokens (notes and [..] bracket stacks).
 *   Chords:        chord SYMBOLS (Cm7, G7/B) realized into notes on input.
 *
 * See parser/stark-grammar.peggy for the syntax.
 */

import { chordSymbolPitches } from "#src/notation/chords/chord-symbols.ts";
import { dedupeNotesKeepingLast, sortNotes } from "#src/notation/note-sort.ts";
import {
  type ChordItem,
  type ChordsContentItem,
  type ChordsSection,
  type DrumSection,
  type PitchedContentItem,
  type PitchedSection,
  type StarkDuration,
  type StarkDynamic,
  type StarkSection,
} from "#src/notation/stark/parser/stark-parser.ts";
import * as parser from "#src/notation/stark/parser/stark-parser.ts";
import {
  BASS_REGISTER_DEFAULT,
  CHORDS_REGISTER_DEFAULT,
  DRUM_DEFAULT,
  durationBeats,
  LINE_DEFAULT,
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

  const lineDefault = section.defaultDuration ?? DRUM_DEFAULT;

  let time = 0;

  for (const item of section.content) {
    if ("barMarker" in item) continue;

    const beats = durationBeats(item.duration ?? lineDefault);
    const count = item.repeat ?? 1;

    // `*N` expands one token into N copies; each hit re-rolls its velocity.
    for (let i = 0; i < count; i++) {
      if (item.type !== "rest") {
        notes.push({
          pitch,
          start_time: time,
          duration: beats,
          velocity: velocityFor(item.velocity),
          probability: 1.0,
        });
      }

      time += beats;
    }
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

// Process a pitched section. Chords are symbolic (realized from chord symbols);
// melody/bass are literal pitches. Both are event-based with /N durations.
function processPitchedSection(
  section: PitchedSection,
  notes: NoteEvent[],
): void {
  if (section.type === "chords") {
    processChordsSection(section, notes);

    return;
  }

  const registerDefault =
    section.type === "bass" ? BASS_REGISTER_DEFAULT : MELODY_REGISTER_DEFAULT;

  const lineDefault = section.defaultDuration ?? LINE_DEFAULT[section.type];

  let time = 0;

  for (const item of section.content) {
    // `*N` expands one token into N copies (a barMarker has no repeat → once).
    const count = "barMarker" in item ? 1 : (item.repeat ?? 1);

    for (let i = 0; i < count; i++) {
      time = processItem(item, time, registerDefault, lineDefault, notes);
    }
  }
}

// Process a chords section: each token is a chord symbol realized into concrete
// notes (closed, root-position voicing stacked from C2). Event-based timing.
function processChordsSection(
  section: ChordsSection,
  notes: NoteEvent[],
): void {
  const lineDefault = section.defaultDuration ?? LINE_DEFAULT.chords;

  let time = 0;

  for (const item of section.content) {
    const count = "barMarker" in item ? 1 : (item.repeat ?? 1);

    for (let i = 0; i < count; i++) {
      time = processChordItem(item, time, lineDefault, notes);
    }
  }
}

// Process one chords-line item; returns the updated time cursor. Tokens are chord
// symbols (realized from the vocab) or explicit [..] bracket voicings (voiced in
// the chord register). An unknown symbol quality warns and skips but STILL
// advances time, so a later chord stays aligned.
function processChordItem(
  item: ChordsContentItem,
  time: number,
  lineDefault: StarkDuration,
  notes: NoteEvent[],
): number {
  if ("barMarker" in item) return time;

  if (item.type === "rest") {
    return time + durationBeats(item.duration ?? lineDefault);
  }

  if (item.type === "chord") {
    return pushBracketChord(
      item,
      time,
      lineDefault,
      CHORDS_REGISTER_DEFAULT,
      notes,
    );
  }

  const beats = durationBeats(item.duration ?? lineDefault);
  const pitches = chordSymbolPitches(
    item.root,
    item.quality,
    item.bass,
    CHORDS_REGISTER_DEFAULT,
    item.octaveShift,
  );

  if (pitches == null) {
    const slash = item.bass == null ? "" : `/${item.bass}`;
    const label = `${item.root}${item.quality}${slash}`;

    console.warn(`Stark: unknown chord symbol "${label}" — skipping`);

    return time + beats;
  }

  const velocity = velocityFor(item.dynamic);

  for (const pitch of pitches) {
    notes.push({
      pitch,
      start_time: time,
      duration: beats,
      velocity,
      probability: 1.0,
    });
  }

  return time + beats;
}

// Process one pitched content item; returns updated time cursor.
function processItem(
  item: PitchedContentItem,
  time: number,
  registerDefault: number,
  lineDefault: StarkDuration,
  notes: NoteEvent[],
): number {
  if ("barMarker" in item) return time;

  if (item.type === "rest") {
    return time + durationBeats(item.duration ?? lineDefault);
  }

  if (item.type === "note") {
    const beats = durationBeats(item.duration ?? lineDefault);
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
  return pushBracketChord(item, time, lineDefault, registerDefault, notes);
}

// Voice an explicit [..] bracket chord at `registerDefault`; every note shares
// one velocity roll. Returns the advanced time cursor. Shared by melody/bass
// (their line register) and chords lines (the chord register).
function pushBracketChord(
  item: ChordItem,
  time: number,
  lineDefault: StarkDuration,
  registerDefault: number,
  notes: NoteEvent[],
): number {
  const beats = durationBeats(item.duration ?? lineDefault);
  const velocity = velocityFor(item.dynamic);

  for (const chordNote of item.notes) {
    notes.push({
      pitch: clampMidi(
        registerDefault +
          pitchOffset(chordNote.letter, chordNote.accidental) +
          chordNote.octaveShift * 12,
      ),
      start_time: time,
      duration: beats,
      velocity,
      probability: 1.0,
    });
  }

  return time + beats;
}

// Clamp a computed pitch to the valid MIDI range.
function clampMidi(midi: number): number {
  return Math.max(0, Math.min(127, midi));
}
