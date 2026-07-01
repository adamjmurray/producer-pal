// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Configuration constants for Abstark notation: a literal, round-trippable
 * music notation. See abstark-grammar.peggy, abstark-interpreter.ts, and
 * abstark-serializer.ts.
 */

// --- Velocity ---

export const VELOCITY_SOFT_MIN = 60;
export const VELOCITY_SOFT_MAX = 80;
export const VELOCITY_NORMAL_MIN = 100;
export const VELOCITY_NORMAL_MAX = 110;
export const VELOCITY_ACCENT_MIN = 115;
export const VELOCITY_ACCENT_MAX = 127;

// Serializer bucketing thresholds (midpoints of the gaps between ranges)
export const VELOCITY_SOFT_THRESHOLD = 90; // below this → soft
export const VELOCITY_ACCENT_THRESHOLD = 112; // at or above this → accent

/**
 * Random integer in [min, max] inclusive (interpreter velocity randomization).
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns A random integer between min and max
 */
export function randomVelocity(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Timing ---

/** Duration of a 16th-note step in Ableton beats (quarter note = 1 beat) */
export const SIXTEENTH_NOTE_BEATS = 0.25;

/**
 * Convert an absolute /N duration denominator to Ableton beats.
 * Absolute note value — NOT an ABC-style multiplier: /4 = 1 beat, /1 = 4 beats.
 * @param n - Duration denominator (1, 2, 4, 8, or 16)
 * @returns Duration in Ableton beats
 */
export function durationBeats(n: number): number {
  return 4 / n;
}

// --- Register defaults ---
// Using Yamaha convention: C4 = MIDI 60 (middle C), C2 = MIDI 36.
// `C` in each line type maps to this MIDI pitch; octave marks shift from here.

/** bass: C2 = MIDI 36 */
export const BASS_REGISTER_DEFAULT = 36;
/** melody: C4 = MIDI 60 */
export const MELODY_REGISTER_DEFAULT = 60;
/** chords: C3 = MIDI 48 (voicing stacks up from here) */
export const CHORDS_REGISTER_DEFAULT = 48;

// --- Line default duration denominators ---
// Applied when no /N on the token AND no /N in the line header.
// Bass and melody default to /4 (quarter), chords default to /1 (whole).

export const LINE_DEFAULT_N: Readonly<
  Record<"bass" | "melody" | "chords", number>
> = {
  bass: 4,
  melody: 4,
  chords: 1,
};

// --- Drum line names ---

/**
 * MIDI pitch → drum line name (for the serializer). Drum-vs-pitched routing is
 * decided by the track (drumMode), not by membership here; this map only picks
 * the readable name for a drum-track note. Pitches absent from this map are
 * serialized as absolute pitch-name headers (e.g. "C3", Ableton C3=60) instead,
 * so every Drum-Rack pad round-trips — nothing is dropped.
 */
// Names follow General MIDI percussion (notes 36-51), which Ableton's factory
// 16-pad Drum Racks track closely. The high-consensus pads (kick/snare/hats/
// toms/crash/ride/rimshot/clap) get their GM names. The genuinely variable pads
// get compromise names: GM-aligned where GM matches the factory tendency (40
// snare2, 41 tom4, 44 pedal) and generic percN where GM says "tom" but factory
// kits put miscellaneous percussion there (48, 50). tom1/2/3/4 run high→low.
export const MIDI_TO_DRUM_NAME: Readonly<Record<number, string>> = {
  36: "kick",
  37: "rimshot",
  38: "snare",
  39: "clap",
  40: "snare2",
  41: "tom4",
  42: "hihat",
  43: "tom3",
  44: "pedal",
  45: "tom2",
  46: "open",
  47: "tom1",
  48: "perc1",
  49: "crash",
  50: "perc2",
  51: "ride",
};
