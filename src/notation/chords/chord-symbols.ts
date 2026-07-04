// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Chord-symbol realization — a notation-agnostic layer (the register floor and
 * octave shift are passed in), currently used only by Stark's chords line.
 * bar|beat intentionally does NOT adopt chord symbols — see
 * dev/decisions/0012-no-chord-symbols-in-bar-beat.md — so this is Stark-only,
 * not a pending "add it everywhere" TODO. A chord symbol is a root + quality +
 * optional slash bass (`Cm7`, `G7/B`, `Fmaj9`); it names a SET of pitch classes
 * that {@link chordSymbolPitches} voices into concrete MIDI pitches — closed,
 * root position, stacked up from a register default.
 *
 * Chord symbols are INPUT-ONLY sugar: a serializer never emits them (naming a
 * set of notes is ambiguous and would fight the notations' literal round-trip),
 * so this module has no inverse. Read-back returns the realized notes literally.
 *
 * {@link CHORD_QUALITY_INTERVALS} is the extensible core — add a row to teach a
 * new quality. Intervals are semitones above the root; an extension implies the
 * tones below it (a `9` chord includes its `7`). `""` = a bare major triad.
 */

import { pitchClassToNumber } from "#src/shared/pitch.ts";

/** A chord symbol resolved to register-independent pitch material. */
export interface ResolvedChord {
  /** Root pitch class (0–11). */
  rootPc: number;
  /** Semitone intervals above the root (0 = root), ascending, root position. */
  intervals: readonly number[];
  /** Slash-bass pitch class (0–11), or null when there is no slash bass. */
  bassPc: number | null;
}

/**
 * Realize a chord symbol into concrete MIDI pitches: closed, root position,
 * stacked up from a register default. Returns null when the root is unspellable
 * or the quality is unknown — the caller warns and skips.
 * @param root - Root pitch-class name (e.g. "C", "Eb", "F#")
 * @param quality - Quality string as written ("" = major triad; "m7", "maj9", …)
 * @param bass - Slash-bass pitch-class name (e.g. "B"), or null
 * @param registerRoot - MIDI value a bare-C root maps to (the voicing floor)
 * @param octaveShift - Whole-chord octave displacement (from octave marks)
 * @returns Ascending, de-duplicated MIDI pitches, or null when unrealizable
 */
export function chordSymbolPitches(
  root: string,
  quality: string,
  bass: string | null,
  registerRoot: number,
  octaveShift: number,
): number[] | null {
  const chord = resolveChordSymbol(root, quality, bass);

  if (chord == null) return null;

  return realizeChordSymbol(chord, registerRoot, octaveShift);
}

/**
 * Resolve a chord symbol to register-independent material: root pitch class,
 * interval set, and optional slash-bass pitch class. Returns null on an
 * unspellable root, an unknown quality, or an unspellable slash bass.
 * @param root - Root pitch-class name
 * @param quality - Quality string ("" = major triad)
 * @param bass - Slash-bass pitch-class name, or null
 * @returns The resolved chord, or null
 */
export function resolveChordSymbol(
  root: string,
  quality: string,
  bass: string | null,
): ResolvedChord | null {
  const rootPc = pitchClassToNumber(root);

  if (rootPc == null) return null;

  const intervals = CHORD_QUALITY_INTERVALS[quality];

  if (intervals == null) return null;

  if (bass == null) {
    return { rootPc, intervals, bassPc: null };
  }

  const bassPc = pitchClassToNumber(bass);

  // A slash bass that isn't a spellable pitch class invalidates the symbol.
  if (bassPc == null) return null;

  return { rootPc, intervals, bassPc };
}

/**
 * Voice a resolved chord into MIDI pitches: stack the intervals up from the root
 * at `registerRoot + rootPc + 12·octaveShift`; place any slash bass at the
 * highest octave strictly below the root (a chord tone becomes an inversion,
 * otherwise an added bottom). Clamp to 0–127, de-duplicate, sort ascending.
 * @param chord - The resolved chord
 * @param registerRoot - MIDI value a bare-C root maps to
 * @param octaveShift - Whole-chord octave displacement
 * @returns Ascending, de-duplicated MIDI pitches
 */
export function realizeChordSymbol(
  chord: ResolvedChord,
  registerRoot: number,
  octaveShift: number,
): number[] {
  const rootMidi = registerRoot + chord.rootPc + octaveShift * 12;
  const pitches = chord.intervals.map((interval) => rootMidi + interval);

  if (chord.bassPc != null) {
    let bassMidi = registerRoot + chord.bassPc + octaveShift * 12;

    // Drop to the highest octave strictly below the root.
    while (bassMidi >= rootMidi) bassMidi -= 12;

    pitches.unshift(bassMidi);
  }

  const clamped = pitches.map((p) => Math.max(0, Math.min(127, p)));

  return [...new Set(clamped)].sort((a, b) => a - b);
}

/**
 * Quality string → semitone intervals above the root. The extensible core:
 * add a row to teach a new quality. `""` (a bare root) is a major triad.
 * Word forms (`maj`, `min`) are canonical; the terse aliases (`M`, `m`, `+`) and
 * the extension chords (each implying the tones below: a `9` includes its `7`)
 * round it out. Case matters — `m` is minor, `M` is a major-7th qualifier.
 */
export const CHORD_QUALITY_INTERVALS: Readonly<
  Record<string, readonly number[]>
> = {
  // Triads
  "": [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  "+": [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sus: [0, 5, 7],
  "5": [0, 7],
  // Sixths
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  min6: [0, 3, 7, 9],
  "69": [0, 4, 7, 9, 14],
  m69: [0, 3, 7, 9, 14],
  // Sevenths
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  aug7: [0, 4, 8, 10],
  "7b5": [0, 4, 6, 10],
  "7#5": [0, 4, 8, 10],
  "7b9": [0, 4, 7, 10, 13],
  "7#9": [0, 4, 7, 10, 15],
  "7#11": [0, 4, 7, 10, 18],
  mMaj7: [0, 3, 7, 11],
  // Ninths
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  M9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  min9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  // Elevenths
  "11": [0, 4, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17],
  maj11: [0, 4, 7, 11, 14, 17],
  add11: [0, 4, 7, 17],
  // Thirteenths
  "13": [0, 4, 7, 10, 14, 21],
  m13: [0, 3, 7, 10, 14, 21],
  maj13: [0, 4, 7, 11, 14, 21],
  add13: [0, 4, 7, 21],
};
