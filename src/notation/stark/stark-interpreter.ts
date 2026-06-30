// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation interpreter: converts an ultra-minimal Stark expression into
 * MIDI note events. Used in small-model mode. See parser/stark-grammar.peggy
 * for the syntax and stark-interpreter-helpers.ts for the music theory.
 */

import * as parser from "#src/notation/stark/parser/stark-parser.ts";
import {
  type ChordContentItem,
  type DrumLine,
  type NoteContentItem,
} from "#src/notation/stark/parser/stark-parser.ts";
import {
  BASS_DEFAULT_OCTAVE,
  BASS_MAX_OCTAVE,
  BASS_MIN_OCTAVE,
  CHORD_OCTAVE,
  MELODY_DEFAULT_OCTAVE,
  MELODY_MAX_OCTAVE,
  MELODY_MIN_OCTAVE,
  QUARTER_NOTE_BEATS,
  SIXTEENTH_NOTE_BEATS,
  VELOCITY_ACCENT_MAX,
  VELOCITY_ACCENT_MIN,
  VELOCITY_LOUD_MAX,
  VELOCITY_LOUD_MIN,
  VELOCITY_SOFT_MAX,
  VELOCITY_SOFT_MIN,
} from "#src/notation/stark/stark-config.ts";
import {
  applyScale,
  chooseOctave,
  CHORD_TYPES,
  getChordQuality,
  parseScale,
  randomVelocity,
  type ScaleType,
} from "#src/notation/stark/stark-interpreter-helpers.ts";
import { type NoteEvent } from "#src/notation/types.ts";

export interface StarkInterpretOptions {
  /** Time signature numerator (beats per bar). Defaults to 4. */
  timeSigNumerator?: number;
  /** Scale string like "C Major" or "Eb Minor". Defaults to C Major. */
  scale?: string;
}

/**
 * Convert a Stark notation string into MIDI note events.
 * @param starkExpression - Stark notation string
 * @param options - Interpretation options
 * @returns Array of note events
 */
export function interpretNotation(
  starkExpression: string,
  options: StarkInterpretOptions = {},
): NoteEvent[] {
  if (!starkExpression || starkExpression.trim() === "") {
    return [];
  }

  const { timeSigNumerator = 4, scale: scaleParam } = options;
  const { root: scaleRoot, type: scaleType } = parseScale(scaleParam);

  let ast;

  try {
    ast = parser.parse(starkExpression);
  } catch (error) {
    throw new Error(`Stark notation parse error: ${(error as Error).message}`, {
      cause: error,
    });
  }

  const notes: NoteEvent[] = [];

  // Drums mode: an array of drum lines
  if (Array.isArray(ast)) {
    for (const drumLine of ast) {
      processDrumLine(drumLine, notes, timeSigNumerator);
    }

    return notes;
  }

  if (ast.type === "bass") {
    processMono(ast, notes, timeSigNumerator, scaleRoot, scaleType, {
      defaultOctave: BASS_DEFAULT_OCTAVE,
      minOctave: BASS_MIN_OCTAVE,
      maxOctave: BASS_MAX_OCTAVE,
    });
  } else if (ast.type === "melody") {
    processMono(ast, notes, timeSigNumerator, scaleRoot, scaleType, {
      defaultOctave: MELODY_DEFAULT_OCTAVE,
      minOctave: MELODY_MIN_OCTAVE,
      maxOctave: MELODY_MAX_OCTAVE,
    });
  } else {
    processChords(ast, notes, timeSigNumerator, scaleRoot, scaleType);
  }

  return notes;
}

// Beats consumed by an item based on its note-value granularity
function itemBeats(duration: "quarter" | "sixteenth"): number {
  return duration === "quarter" ? QUARTER_NOTE_BEATS : SIXTEENTH_NOTE_BEATS;
}

// Velocity for a dynamic level, randomized within its range
function velocityFor(level: "accent" | "loud" | "soft"): number {
  if (level === "accent")
    return randomVelocity(VELOCITY_ACCENT_MIN, VELOCITY_ACCENT_MAX);
  if (level === "loud")
    return randomVelocity(VELOCITY_LOUD_MIN, VELOCITY_LOUD_MAX);

  return randomVelocity(VELOCITY_SOFT_MIN, VELOCITY_SOFT_MAX);
}

// Process a single drum line into note events
function processDrumLine(
  drumLine: DrumLine,
  notes: NoteEvent[],
  beatsPerBar: number,
): void {
  let time = 0;
  let bar = 1;

  for (const item of drumLine.content) {
    if ("barMarker" in item) {
      bar++;
      time = (bar - 1) * beatsPerBar;
      continue;
    }

    const duration = itemBeats(item.duration);

    // Rests and sustains both just advance time (drums don't retrigger).
    if (item.type === "rest" || item.type === "sustain") {
      time += duration;
      continue;
    }

    notes.push({
      pitch: drumLine.midi,
      start_time: time,
      duration,
      velocity: velocityFor(item.velocity),
      probability: 1.0,
    });
    time += duration;
  }
}

// Process bass/melody (mono) mode into note events
function processMono(
  line: { content: NoteContentItem[] },
  notes: NoteEvent[],
  beatsPerBar: number,
  scaleRoot: number,
  scaleType: ScaleType,
  range: { defaultOctave: number; minOctave: number; maxOctave: number },
): void {
  let time = 0;
  let bar = 1;
  let prevMidi: number | null = null;
  let sustainingNote: NoteEvent | null = null;

  for (const item of line.content) {
    if ("barMarker" in item) {
      bar++;
      time = (bar - 1) * beatsPerBar;
      sustainingNote = null;
      continue;
    }

    const duration = itemBeats(item.duration);

    if (item.type === "rest") {
      time += duration;
      sustainingNote = null;
      continue;
    }

    if (item.type === "sustain") {
      if (sustainingNote) sustainingNote.duration += duration;
      time += duration;
      continue;
    }

    const pitchClass = applyScale(item.note, scaleRoot, scaleType);
    const midi = chooseOctave(
      pitchClass,
      prevMidi,
      range.minOctave,
      range.maxOctave,
      range.defaultOctave,
    );
    const note: NoteEvent = {
      pitch: midi,
      start_time: time,
      duration,
      velocity: velocityFor(item.velocity),
      probability: 1.0,
    };

    notes.push(note);
    prevMidi = midi;
    sustainingNote = note;
    time += duration;
  }
}

// Process chords mode into note events
function processChords(
  line: { content: ChordContentItem[] },
  notes: NoteEvent[],
  beatsPerBar: number,
  scaleRoot: number,
  scaleType: ScaleType,
): void {
  const letterMap: Readonly<Record<string, number>> = {
    C: 0,
    D: 1,
    E: 2,
    F: 3,
    G: 4,
    A: 5,
    B: 6,
  };
  let time = 0;
  let bar = 1;

  for (const item of line.content) {
    if ("barMarker" in item) {
      bar++;
      time = (bar - 1) * beatsPerBar;
      continue;
    }

    const duration = itemBeats(item.duration);

    if (item.type === "rest") {
      time += duration;
      continue;
    }

    if (item.type === "sustain") {
      // Extend every note that started with the previous chord.
      const prevTime = time - duration;

      for (const note of notes) {
        if (Math.abs(note.start_time - prevTime) < 0.001) {
          note.duration += duration;
        }
      }

      time += duration;
      continue;
    }

    // Grammar guarantees item.root is one of C-B, so the lookup is defined.
    const degree = letterMap[item.root] as number;
    const rootPitchClass = applyScale(item.root, scaleRoot, scaleType);
    const intervals =
      CHORD_TYPES[getChordQuality(degree, scaleType, item.hasSeventh)];
    const velocity = velocityFor(item.velocity);

    for (const interval of intervals) {
      notes.push({
        pitch: CHORD_OCTAVE * 12 + ((rootPitchClass + interval) % 12),
        start_time: time,
        duration,
        velocity,
        probability: 1.0,
      });
    }

    time += duration;
  }
}
