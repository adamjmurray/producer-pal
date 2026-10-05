// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";

// Each pair is the same Stark written with ♯/♭ and with # and b. The glyphs are
// normalized in the grammar, so both must interpret identically.
/**
 * Velocity is randomized within its bucket, so compare only the fixed fields.
 * @param stark - Stark text
 * @returns Pitch, timing and length of each note
 */
function shape(stark: string): unknown[] {
  return interpretNotation(stark).map((n) => [
    n.pitch,
    n.start_time,
    n.duration,
  ]);
}

const CASES: ReadonlyArray<readonly [string, string, string]> = [
  ["note token", "melody: C♯ E♭ G", "melody: C# Eb G"],
  ["note with octave marks", "melody: C♯'/8! E♭,/2?", "melody: C#'/8! Eb,/2?"],
  ["note with absolute octave", "melody: C♯3 E♭-1", "melody: C#3 Eb-1"],
  ["lowercase letter", "melody: c♯ e♭", "melody: c# eb"],
  ["glyph then repeat", "melody: F♯*3", "melody: F#*3"],
  ["bass line", "bass: B♭ F♯", "bass: Bb F#"],
  ["bracket chord notes", "melody: [C♯ E♭3 G]/2", "melody: [C# Eb3 G]/2"],
  ["chord root", "chords: E♭m7 F♯", "chords: Ebm7 F#"],
  ["slash bass", "chords: G7/B♭ C/F♯", "chords: G7/Bb C/F#"],
  ["chord quality", "chords: C7♯9 Cm7♭5 C7♭9", "chords: C7#9 Cm7b5 C7b9"],
  [
    "voicing on a chords line",
    "chords: Cm7 [E♭ G C♯']",
    "chords: Cm7 [Eb G C#']",
  ],
  ["drum header pitch name", "C♯1: X X", "C#1: X X"],
  ["drum header, negative octave", "D♭-1: X", "Db-1: X"],
  ["mixed with ASCII", "melody: C♯ Eb F# G♭", "melody: C# Eb F# Gb"],
];

describe("stark accidental glyphs ♯ and ♭", () => {
  for (const [where, glyphs, ascii] of CASES) {
    it(`${where}: same notes as # and b`, () => {
      const expected = shape(ascii);

      expect(expected.length).toBeGreaterThan(0);
      expect(shape(glyphs)).toStrictEqual(expected);
    });
  }

  it("resolves the glyphs to the right pitches", () => {
    const pitches = interpretNotation("melody: C♯ E♭").map((n) => n.pitch);

    expect(pitches).toStrictEqual([61, 63]);
  });

  it("an uppercase B is still the note B, never a flat", () => {
    const pitches = interpretNotation("melody: C B").map((n) => n.pitch);

    expect(pitches).toStrictEqual([60, 71]);
  });

  it("rejects a doubled glyph", () => {
    expect(() => interpretNotation("melody: C♯♯")).toThrow(
      /Stark notation parse error/,
    );
  });
});
