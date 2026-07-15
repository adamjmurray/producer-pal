// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  CHORD_QUALITY_INTERVALS,
  chordSymbolPitches,
  realizeChordSymbol,
  resolveChordSymbol,
} from "#src/notation/chords/chord-symbols.ts";

// C2 = MIDI 48 is Stark's chords register default; most cases voice from here.
const C2 = 48;

describe("chordSymbolPitches — triads (bare root = major)", () => {
  it("a bare root is a major triad", () => {
    expect(chordSymbolPitches("C", "", null, C2, 0)).toStrictEqual([
      48, 52, 55,
    ]);
  });

  it("maj and M are also major", () => {
    expect(chordSymbolPitches("C", "maj", null, C2, 0)).toStrictEqual([
      48, 52, 55,
    ]);
    expect(chordSymbolPitches("C", "M", null, C2, 0)).toStrictEqual([
      48, 52, 55,
    ]);
  });

  it("m and min are minor", () => {
    expect(chordSymbolPitches("C", "m", null, C2, 0)).toStrictEqual([
      48, 51, 55,
    ]);
    expect(chordSymbolPitches("C", "min", null, C2, 0)).toStrictEqual([
      48, 51, 55,
    ]);
  });

  it("dim, aug, and + voice the altered fifth", () => {
    expect(chordSymbolPitches("C", "dim", null, C2, 0)).toStrictEqual([
      48, 51, 54,
    ]);
    expect(chordSymbolPitches("C", "aug", null, C2, 0)).toStrictEqual([
      48, 52, 56,
    ]);
    expect(chordSymbolPitches("C", "+", null, C2, 0)).toStrictEqual([
      48, 52, 56,
    ]);
  });

  it("sus2/sus4/sus and 5 (power) replace or drop the third", () => {
    expect(chordSymbolPitches("C", "sus2", null, C2, 0)).toStrictEqual([
      48, 50, 55,
    ]);
    expect(chordSymbolPitches("C", "sus4", null, C2, 0)).toStrictEqual([
      48, 53, 55,
    ]);
    expect(chordSymbolPitches("C", "sus", null, C2, 0)).toStrictEqual([
      48, 53, 55,
    ]);
    expect(chordSymbolPitches("C", "5", null, C2, 0)).toStrictEqual([48, 55]);
  });
});

describe("chordSymbolPitches — sevenths and extensions", () => {
  it("dominant, major, and minor sevenths", () => {
    expect(chordSymbolPitches("C", "7", null, C2, 0)).toStrictEqual([
      48, 52, 55, 58,
    ]);
    expect(chordSymbolPitches("C", "maj7", null, C2, 0)).toStrictEqual([
      48, 52, 55, 59,
    ]);
    expect(chordSymbolPitches("C", "m7", null, C2, 0)).toStrictEqual([
      48, 51, 55, 58,
    ]);
  });

  it("half-diminished (m7b5) and fully diminished (dim7)", () => {
    expect(chordSymbolPitches("C", "m7b5", null, C2, 0)).toStrictEqual([
      48, 51, 54, 58,
    ]);
    expect(chordSymbolPitches("C", "dim7", null, C2, 0)).toStrictEqual([
      48, 51, 54, 57,
    ]);
  });

  it("an extension implies the tones below it (9 includes its 7)", () => {
    expect(chordSymbolPitches("C", "9", null, C2, 0)).toStrictEqual([
      48, 52, 55, 58, 62,
    ]);
    expect(chordSymbolPitches("C", "maj9", null, C2, 0)).toStrictEqual([
      48, 52, 55, 59, 62,
    ]);
    expect(chordSymbolPitches("C", "13", null, C2, 0)).toStrictEqual([
      48, 52, 55, 58, 62, 69,
    ]);
  });

  it("add chords stack the extension without the seventh", () => {
    expect(chordSymbolPitches("C", "add9", null, C2, 0)).toStrictEqual([
      48, 52, 55, 62,
    ]);
  });
});

describe("chordSymbolPitches — root spelling", () => {
  it("accepts flats and sharps on the root", () => {
    expect(chordSymbolPitches("Eb", "m7", null, C2, 0)).toStrictEqual([
      51, 54, 58, 61,
    ]);
    expect(chordSymbolPitches("F#", "", null, C2, 0)).toStrictEqual([
      54, 58, 61,
    ]);
  });

  it("is case-insensitive on the root letter", () => {
    expect(chordSymbolPitches("c", "m", null, C2, 0)).toStrictEqual([
      48, 51, 55,
    ]);
  });

  it("accepts theoretical enharmonic roots (Cb, Fb, E#, B#) like the melody line", () => {
    // Arithmetic resolution wraps at the octave edges — matching Stark's melody
    // line and bar|beat; the shared 12-entry table would reject these.
    expect(resolveChordSymbol("Cb", "", null)?.rootPc).toBe(11); // → B
    expect(resolveChordSymbol("Fb", "", null)?.rootPc).toBe(4); // → E
    expect(resolveChordSymbol("E#", "", null)?.rootPc).toBe(5); // → F
    expect(resolveChordSymbol("B#", "", null)?.rootPc).toBe(0); // → C
  });

  it("accepts an enharmonic slash bass too (Cb → B)", () => {
    expect(resolveChordSymbol("C", "", "Cb")?.bassPc).toBe(11);
  });

  it("null on a malformed accidental in the root", () => {
    expect(chordSymbolPitches("Cx", "", null, C2, 0)).toBeNull();
  });

  it("null on an invalid root letter that carries an accidental (Hb)", () => {
    // The bad-letter guard must fire before the accidental is applied — else
    // "Hb" would resolve to a NaN pitch class instead of rejecting the symbol.
    expect(chordSymbolPitches("Hb", "", null, C2, 0)).toBeNull();
  });

  it("null on an empty root name", () => {
    expect(resolveChordSymbol("", "", null)).toBeNull();
  });
});

describe("chordSymbolPitches — slash bass", () => {
  it("places a non-chord-tone bass below the root (added bottom)", () => {
    // G7/B: G7 = [55,59,62,65]; B drops to 47 (highest B below G2=55).
    expect(chordSymbolPitches("G", "7", "B", C2, 0)).toStrictEqual([
      47, 55, 59, 62, 65,
    ]);
  });

  it("a chord-tone bass becomes an inversion", () => {
    // C/G: C major = [48,52,55]; G drops to 43 (below C2=48).
    expect(chordSymbolPitches("C", "", "G", C2, 0)).toStrictEqual([
      43, 48, 52, 55,
    ]);
  });

  it("accepts an accidental on the slash bass", () => {
    expect(chordSymbolPitches("C", "m7", "Bb", C2, 0)).toStrictEqual([
      46, 48, 51, 55, 58,
    ]);
  });

  it("a slash bass equal to the root drops a full octave below it (not onto it)", () => {
    // C/C: root C2=48; the bass C must land at 36 — the highest C *strictly*
    // below the root — rather than collapsing onto the root at 48.
    expect(chordSymbolPitches("C", "", "C", C2, 0)).toStrictEqual([
      36, 48, 52, 55,
    ]);
  });
});

describe("chordSymbolPitches — octave shift", () => {
  it("shifts the whole chord (bass included) by 12 per octave", () => {
    expect(chordSymbolPitches("C", "", null, C2, 1)).toStrictEqual([
      60, 64, 67,
    ]);
    expect(chordSymbolPitches("C", "", null, C2, -1)).toStrictEqual([
      36, 40, 43,
    ]);
    // Slash bass shifts with the chord.
    expect(chordSymbolPitches("C", "", "G", C2, 1)).toStrictEqual([
      55, 60, 64, 67,
    ]);
  });
});

describe("chordSymbolPitches — unrealizable inputs return null", () => {
  it("null on an unspellable root", () => {
    expect(chordSymbolPitches("H", "m7", null, C2, 0)).toBeNull();
  });

  it("null on an unknown quality", () => {
    expect(chordSymbolPitches("C", "wat", null, C2, 0)).toBeNull();
  });

  it("null on an unspellable slash bass", () => {
    expect(chordSymbolPitches("C", "", "H", C2, 0)).toBeNull();
  });
});

describe("realizeChordSymbol — clamping and de-duplication", () => {
  it("clamps out-of-range pitches to 0–127", () => {
    const high = realizeChordSymbol(
      { rootPc: 0, intervals: [0, 4, 7], bassPc: null },
      120,
      1,
    );

    expect(high).toStrictEqual([127]); // 132/136/139 all clamp+dedupe to 127
  });

  it("de-duplicates a bass that collapses onto a chord tone at 0", () => {
    const pitches = realizeChordSymbol(
      { rootPc: 0, intervals: [0, 7], bassPc: 7 },
      0,
      0,
    );

    // root 0, fifth 7; bass 7 drops below 0 → -5 → clamps to 0 → dedup with root.
    expect(pitches).toStrictEqual([0, 7]);
  });
});

describe("resolveChordSymbol", () => {
  it("returns register-independent material", () => {
    expect(resolveChordSymbol("D", "m7", "G")).toStrictEqual({
      rootPc: 2,
      intervals: [0, 3, 7, 10],
      bassPc: 7,
    });
  });

  it("returns null bassPc when there is no slash bass", () => {
    expect(resolveChordSymbol("D", "", null)).toStrictEqual({
      rootPc: 2,
      intervals: [0, 4, 7],
      bassPc: null,
    });
  });
});

// An independent golden spec of the semitone intervals every chord quality must
// produce. Deliberately hand-written here rather than imported from source — it
// is the contract CHORD_QUALITY_INTERVALS must satisfy, so blanking a row or
// mistyping an interval in the source table is caught by these assertions
// instead of passing silently on a quality no other test happens to exercise.
const EXPECTED_INTERVALS: Record<string, readonly number[]> = {
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

describe("CHORD_QUALITY_INTERVALS — every quality matches the golden spec", () => {
  it("covers exactly the golden set of qualities (no untested rows drift in)", () => {
    expect(Object.keys(CHORD_QUALITY_INTERVALS).sort()).toStrictEqual(
      Object.keys(EXPECTED_INTERVALS).sort(),
    );
  });

  for (const [quality, intervals] of Object.entries(EXPECTED_INTERVALS)) {
    it(`resolves "${quality || "(bare root)"}" to [${intervals.join(", ")}]`, () => {
      expect(resolveChordSymbol("C", quality, null)?.intervals).toStrictEqual(
        intervals,
      );
    });
  }
});
