// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Music-theory helpers for the Stark interpreter: scale parsing, scale
 * adherence, diatonic chord qualities, and closest-octave selection.
 */

import {
  DEFAULT_SCALE_ROOT,
  DEFAULT_SCALE_TYPE,
} from "#src/notation/stark/stark-config.ts";
import { pitchClassToNumber } from "#src/shared/pitch.ts";

// Scale definitions: intervals in semitones from the root
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10], // same as natural minor
  locrian: [0, 1, 3, 5, 6, 8, 10],
} as const;

export type ScaleType = keyof typeof SCALES;

// Chord intervals (triad + optional 7th)
export const CHORD_TYPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  halfdim7: [0, 3, 6, 10], // ø7
  dim7: [0, 3, 6, 9],
} as const;

export type ChordType = keyof typeof CHORD_TYPES;

/**
 * Random integer in the range [min, max] inclusive.
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns A random integer between min and max
 */
export function randomVelocity(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Parse a scale string like "C Major" or "Eb Minor".
 * @param scaleString - e.g., "C Major", "Eb Minor" (defaults to C Major)
 * @returns root pitch class (0-11) and scale type
 */
export function parseScale(scaleString?: string): {
  root: number;
  type: ScaleType;
} {
  if (!scaleString) {
    return { root: DEFAULT_SCALE_ROOT, type: DEFAULT_SCALE_TYPE };
  }

  const parts = scaleString.trim().split(/\s+/);

  if (parts.length < 2) {
    throw new Error(`Invalid scale string: "${scaleString}"`);
  }

  const rootName = parts[0] as string;
  const scaleName = parts.slice(1).join(" ").toLowerCase();

  const root = pitchClassToNumber(rootName);

  if (root == null) {
    throw new Error(`Invalid scale root: "${rootName}"`);
  }

  if (!(scaleName in SCALES)) {
    throw new Error(
      `Unknown scale type: "${scaleName}". Supported: ${Object.keys(SCALES).join(", ")}`,
    );
  }

  return { root, type: scaleName as ScaleType };
}

/** Natural pitch class for each letter name (no accidentals) */
const NATURAL_PITCH_CLASSES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Apply a scale to a letter name (A-G) to get the nearest in-scale pitch class.
 * @param letter - "A" through "G"
 * @param scaleRoot - 0-11
 * @param scaleType - scale name
 * @returns MIDI pitch class (0-11)
 */
export function applyScale(
  letter: string,
  scaleRoot: number,
  scaleType: ScaleType,
): number {
  const naturalPitchClass = NATURAL_PITCH_CLASSES[letter];

  if (naturalPitchClass == null) {
    throw new Error(`Invalid note letter: ${letter}`);
  }

  const scalePitchClasses = SCALES[scaleType].map((i) => (scaleRoot + i) % 12);

  // Find the closest scale pitch class to the natural pitch class
  let closestPitch = scalePitchClasses[0] as number;
  let minDistance = Math.abs(naturalPitchClass - closestPitch);

  for (const scalePitch of scalePitchClasses) {
    const distance = Math.abs(naturalPitchClass - scalePitch);

    if (distance < minDistance) {
      minDistance = distance;
      closestPitch = scalePitch;
    }
  }

  return closestPitch;
}

// Diatonic chord qualities by scale degree (I, ii, iii, IV, V, vi, vii).
// Modes other than major/minor use major-scale qualities (simplified).
const CHORD_QUALITIES: Record<
  ScaleType,
  { triads: ChordType[]; sevenths: ChordType[] }
> = {
  major: {
    triads: [
      "major",
      "minor",
      "minor",
      "major",
      "major",
      "minor",
      "diminished",
    ],
    sevenths: ["maj7", "min7", "min7", "maj7", "dom7", "min7", "halfdim7"],
  },
  minor: {
    triads: [
      "minor",
      "diminished",
      "major",
      "minor",
      "minor",
      "major",
      "major",
    ],
    sevenths: ["min7", "halfdim7", "maj7", "min7", "min7", "maj7", "dom7"],
  },
  dorian: {
    triads: [
      "minor",
      "minor",
      "major",
      "major",
      "minor",
      "diminished",
      "major",
    ],
    sevenths: ["min7", "min7", "maj7", "dom7", "min7", "halfdim7", "maj7"],
  },
  phrygian: {
    triads: [
      "minor",
      "major",
      "major",
      "minor",
      "diminished",
      "major",
      "minor",
    ],
    sevenths: ["min7", "maj7", "dom7", "min7", "halfdim7", "maj7", "min7"],
  },
  lydian: {
    triads: [
      "major",
      "major",
      "minor",
      "diminished",
      "major",
      "minor",
      "minor",
    ],
    sevenths: ["maj7", "dom7", "min7", "halfdim7", "maj7", "min7", "min7"],
  },
  mixolydian: {
    triads: [
      "major",
      "minor",
      "diminished",
      "major",
      "minor",
      "minor",
      "major",
    ],
    sevenths: ["dom7", "min7", "halfdim7", "maj7", "min7", "min7", "maj7"],
  },
  aeolian: {
    triads: [
      "minor",
      "diminished",
      "major",
      "minor",
      "minor",
      "major",
      "major",
    ],
    sevenths: ["min7", "halfdim7", "maj7", "min7", "min7", "maj7", "dom7"],
  },
  locrian: {
    triads: [
      "diminished",
      "major",
      "minor",
      "minor",
      "major",
      "major",
      "minor",
    ],
    sevenths: ["halfdim7", "maj7", "min7", "min7", "maj7", "dom7", "min7"],
  },
};

/**
 * Diatonic chord quality for a scale degree.
 * @param degree - 0-6 scale degree
 * @param scaleType - scale name
 * @param hasSeventh - whether to include a 7th
 * @returns chord type name
 */
export function getChordQuality(
  degree: number,
  scaleType: ScaleType,
  hasSeventh: boolean,
): ChordType {
  const table = CHORD_QUALITIES[scaleType];
  const list = hasSeventh ? table.sevenths : table.triads;

  return list[degree] as ChordType;
}

/**
 * Choose the octave that places a pitch class closest to the previous note,
 * constrained to a register range.
 * @param pitchClass - 0-11
 * @param prevMidi - previous MIDI note (null for the first note)
 * @param minOctave - minimum octave
 * @param maxOctave - maximum octave
 * @param defaultOctave - default octave when there is no previous note
 * @returns MIDI note number
 */
export function chooseOctave(
  pitchClass: number,
  prevMidi: number | null,
  minOctave: number,
  maxOctave: number,
  defaultOctave: number,
): number {
  if (prevMidi == null) {
    // First note: pick the octave that lands nearest the middle of the range,
    // so the register is consistent regardless of pitch class.
    const targetMidi = (minOctave * 12 + maxOctave * 12) / 2;
    let bestMidi = defaultOctave * 12 + pitchClass;
    let bestDist = Math.abs(bestMidi - targetMidi);

    for (let octave = minOctave; octave <= maxOctave; octave++) {
      const midi = octave * 12 + pitchClass;
      const dist = Math.abs(midi - targetMidi);

      if (dist < bestDist) {
        bestDist = dist;
        bestMidi = midi;
      }
    }

    return bestMidi;
  }

  const prevOctave = Math.floor(prevMidi / 12);

  // Try same octave, then above, then below — keep the closest interval.
  let bestMidi = prevOctave * 12 + pitchClass;
  let bestDist = Math.abs(bestMidi - prevMidi);
  const aboveMidi = bestMidi + 12;

  if (Math.abs(aboveMidi - prevMidi) < bestDist) {
    bestMidi = aboveMidi;
    bestDist = Math.abs(aboveMidi - prevMidi);
  }

  const belowMidi = bestMidi - 12;

  if (Math.abs(belowMidi - prevMidi) < bestDist) {
    bestMidi = belowMidi;
  }

  // Constrain to range
  const minMidi = minOctave * 12;
  const maxMidi = maxOctave * 12 + 11;

  if (bestMidi < minMidi) return minMidi + pitchClass;
  if (bestMidi > maxMidi) return maxMidi - (11 - pitchClass);

  return bestMidi;
}
