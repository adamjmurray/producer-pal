// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Canonical pitch conversion utilities.
 *
 * This module is the single source of truth for pitch↔MIDI conversions.
 * Other modules should import from here rather than defining their own.
 *
 * Output format: Uses flats (Db, Eb, Gb, Ab, Bb) per music theory convention.
 * Input format: Accepts both sharps and flats, case-insensitive.
 *
 * Note: src/notation/transform/parser/transform-grammar.peggy has an inline
 * copy of PITCH_CLASS_VALUES because Peggy cannot import JS modules.
 */

/**
 * Pitch class names using flats (music theory convention).
 * Index corresponds to semitones above C (0-11).
 */
export const PITCH_CLASS_NAMES: readonly string[] = Object.freeze([
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
]);

/**
 * Mapping from pitch class names to semitone values (0-11).
 * Supports both sharps and flats for input flexibility.
 */
export const PITCH_CLASS_VALUES: Readonly<Record<string, number>> =
  Object.freeze({
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  });

/**
 * Lowercase mapping for case-insensitive pitch class lookup.
 */
const PITCH_CLASS_VALUES_LOWERCASE: Readonly<Record<string, number>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(PITCH_CLASS_VALUES).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    ),
  );

/**
 * Array of valid pitch class name strings.
 */
export const VALID_PITCH_CLASS_NAMES: readonly string[] = Object.freeze(
  Object.keys(PITCH_CLASS_VALUES),
);

/**
 * Check if a MIDI note number is valid (0-127).
 * @param midi - Value to check
 * @returns True if valid MIDI number
 */
export function isValidMidi(midi: unknown): midi is number {
  return (
    typeof midi === "number" &&
    Number.isInteger(midi) &&
    midi >= 0 &&
    midi <= 127
  );
}

/**
 * Check if a string is a valid note name (e.g., "C3", "F#4", "Bb-1").
 * Case-insensitive.
 * @param name - Value to check
 * @returns True if valid note name
 */
export function isValidNoteName(name: unknown): name is string {
  if (typeof name !== "string") return false;

  const match = name.match(/^([A-Ga-g][#Bb]?)(-?\d+)$/);

  if (!match) return false;

  const pitchClass = (match[1] as string).toLowerCase();

  return pitchClass in PITCH_CLASS_VALUES_LOWERCASE;
}

/**
 * Check if a string is a valid pitch class name (without octave).
 * Case-insensitive.
 * @param name - Value to check
 * @returns True if valid pitch class name
 */
export function isValidPitchClassName(name: unknown): name is string {
  if (typeof name !== "string") return false;

  return name.toLowerCase() in PITCH_CLASS_VALUES_LOWERCASE;
}

/**
 * Convert pitch class name to semitone number (0-11).
 * Case-insensitive.
 * @param name - Pitch class name (e.g., "C", "F#", "Bb")
 * @returns Semitone number (0-11), or null if invalid
 */
export function pitchClassToNumber(name: string): number | null {
  if (typeof name !== "string") {
    return null;
  }

  const value = PITCH_CLASS_VALUES_LOWERCASE[name.toLowerCase()];

  return value ?? null;
}

/**
 * Convert semitone number to pitch class name.
 * Always outputs using flats (Db, Eb, Gb, Ab, Bb).
 * @param num - Semitone number (0-11)
 * @returns Pitch class name, or null if invalid
 */
export function numberToPitchClass(num: number): string | null {
  if (
    typeof num !== "number" ||
    !Number.isInteger(num) ||
    num < 0 ||
    num > 11
  ) {
    return null;
  }

  return PITCH_CLASS_NAMES[num] ?? null;
}

/**
 * Convert MIDI note number to note name (e.g., 60 → "C3").
 * Always outputs using flats (Db, Eb, Gb, Ab, Bb).
 * @param midi - MIDI note number (0-127)
 * @returns Note name, or null if invalid
 */
export function midiToNoteName(midi: number): string | null {
  if (!isValidMidi(midi)) {
    return null;
  }

  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 2;

  return `${PITCH_CLASS_NAMES[pitchClass]}${octave}`;
}

/**
 * Convert note name to MIDI note number (e.g., "C3" → 60).
 * Case-insensitive, accepts both sharps and flats.
 * @param name - Note name (e.g., "C3", "F#4", "Bb-1", "c#3")
 * @returns MIDI note number (0-127), or null if invalid
 */
export function noteNameToMidi(name: string): number | null {
  if (typeof name !== "string" || name.length < 2) {
    return null;
  }

  const match = name.match(/^([A-Ga-g][#Bb]?)(-?\d+)$/);

  if (!match) {
    return null;
  }

  const pitchClassName = match[1] as string;
  const octaveStr = match[2] as string;
  // Note: pitchClassToNumber won't return null here because the regex
  // already validates that pitchClassName is a valid pitch class (A-G with optional #/b)
  const pitchClass = pitchClassToNumber(pitchClassName) as number;
  const octave = Number.parseInt(octaveStr);

  // MIDI note = (octave + 2) * 12 + pitchClass
  // C3 = (3 + 2) * 12 + 0 = 60
  const midi = (octave + 2) * 12 + pitchClass;

  if (midi < 0 || midi > 127) {
    return null;
  }

  return midi;
}

/**
 * Convert scale intervals to pitch class names using the given root note.
 * @param intervals - Array of semitone intervals from root (e.g., [0, 2, 4, 5, 7, 9, 11])
 * @param rootNote - Root note number (0-11, where 0 = C)
 * @returns Array of pitch class names (e.g., ["C", "D", "E", "F", "G", "A", "B"])
 */
export function intervalsToPitchClasses(
  intervals: number[],
  rootNote: number,
): string[] {
  return intervals.map((interval) => {
    const pitchClass = (rootNote + interval) % 12;

    return PITCH_CLASS_NAMES[pitchClass] as string;
  });
}

/** Bitmask with all 12 pitch classes set (chromatic scale). */
export const CHROMATIC_SCALE_MASK = 0xfff;

/**
 * Convert scale intervals and root note to a pitch class bitmask.
 * Bit N = 1 means pitch class N is in the scale.
 * @param intervals - Semitone intervals from root (e.g., [0, 2, 4, 5, 7, 9, 11])
 * @param rootNote - Root note number (0-11, where 0 = C)
 * @returns Bitmask (e.g., C Major → 2741)
 */
export function scaleIntervalsToPitchClassMask(
  intervals: number[],
  rootNote: number,
): number {
  let mask = 0;

  for (const interval of intervals) {
    const pitchClass = (rootNote + interval) % 12;

    mask |= 1 << pitchClass;
  }

  return mask;
}

/**
 * Quantize a pitch to the nearest in-scale pitch using a pitch class bitmask.
 * When equidistant, prefers the higher pitch. Clamps result to 0-127 using
 * scale-aware boundary clamping (nearest in-scale pitch within range).
 * @param pitch - Input pitch (will be rounded to nearest integer)
 * @param scaleMask - Bitmask of in-scale pitch classes (bit N = pitch class N)
 * @returns Nearest in-scale MIDI pitch (0-127)
 */
export function quantizePitchToScale(pitch: number, scaleMask: number): number {
  const rounded = Math.round(pitch);

  // Search outward from rounded pitch; check higher first for tie-breaking
  for (let distance = 0; distance <= 11; distance++) {
    const higher = rounded + distance;

    if ((scaleMask >> (((higher % 12) + 12) % 12)) & 1) {
      return clampToScaleBounds(higher, scaleMask);
    }

    if (distance > 0) {
      const lower = rounded - distance;

      if ((scaleMask >> (((lower % 12) + 12) % 12)) & 1) {
        return clampToScaleBounds(lower, scaleMask);
      }
    }
  }

  return Math.max(0, Math.min(127, rounded));
}

/**
 * Move a pitch by N scale steps using a pitch class bitmask.
 * Quantizes basePitch to the nearest in-scale pitch first, then walks
 * the given number of steps up (positive) or down (negative) through the scale.
 * @param basePitch - Starting pitch (will be quantized to nearest in-scale)
 * @param offset - Number of scale steps to move (rounded to integer)
 * @param scaleMask - Bitmask of in-scale pitch classes (bit N = pitch class N)
 * @returns In-scale MIDI pitch (0-127)
 */
export function stepInScale(
  basePitch: number,
  offset: number,
  scaleMask: number,
): number {
  const start = quantizePitchToScale(basePitch, scaleMask);
  const steps = Math.round(offset);

  if (steps === 0) return start;

  const direction = steps > 0 ? 1 : -1;
  let remaining = Math.abs(steps);
  let current = start;

  while (remaining > 0) {
    current += direction;

    if (current < 0 || current > 127) {
      return clampToScaleBounds(current, scaleMask);
    }

    if ((scaleMask >> (((current % 12) + 12) % 12)) & 1) {
      remaining--;
    }
  }

  return current;
}

/**
 * Clamp a pitch to 0-127, snapping to the nearest in-scale pitch at boundaries.
 * @param pitch - Pitch to clamp
 * @param scaleMask - Bitmask of in-scale pitch classes
 * @returns In-scale pitch within 0-127
 */
function clampToScaleBounds(pitch: number, scaleMask: number): number {
  if (pitch > 127) {
    for (let p = 127; p >= 0; p--) {
      if ((scaleMask >> (p % 12)) & 1) return p;
    }
  }

  if (pitch < 0) {
    for (let p = 0; p <= 127; p++) {
      if ((scaleMask >> (p % 12)) & 1) return p;
    }
  }

  return pitch;
}
