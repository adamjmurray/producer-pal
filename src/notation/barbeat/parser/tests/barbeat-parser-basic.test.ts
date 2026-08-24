// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

describe("BarBeatScript Parser - basic tests", () => {
  describe("basic structure", () => {
    it("parses an empty input", () => {
      expect(parser.parse("")).toStrictEqual([]);
      expect(parser.parse("  \t\n ")).toStrictEqual([]);
    });

    it("parses a sequence of notes", () => {
      expect(parser.parse("C3 E3 G3")).toStrictEqual([
        { pitch: 60 },
        { pitch: 64 },
        { pitch: 67 },
      ]);
    });

    it("parses mixed elements (state + notes)", () => {
      expect(parser.parse("1|1 v100 n/2 p0.8 C3 D3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { velocity: 100 },
        { duration: 1 / 2 },
        { probability: 0.8 },
        { pitch: 60 },
        { pitch: 62 },
      ]);
    });

    it("parses state-only input", () => {
      expect(parser.parse("2|3 v80 n/16 p0.9")).toStrictEqual([
        { bar: 2, beat: 3 },
        { velocity: 80 },
        { duration: 1 / 16 },
        { probability: 0.9 },
      ]);
    });
  });

  describe("pitch", () => {
    it("parses out-of-range MIDI pitch (range enforced in interpreter)", () => {
      expect(parser.parse("C-3")).toStrictEqual([{ pitch: -12 }]);
      expect(parser.parse("C9")).toStrictEqual([{ pitch: 132 }]);
    });

    it("handles enharmonic spellings", () => {
      expect(parser.parse("C3 D#3 Eb3 F#3 Gb3")).toStrictEqual([
        { pitch: 60 }, // C3
        { pitch: 63 }, // D#3
        { pitch: 63 }, // Eb3
        { pitch: 66 }, // F#3
        { pitch: 66 }, // Gb3
      ]);
    });

    it("supports enharmonic spellings B#, Cb, E#, Fb (octave wrap included)", () => {
      expect(parser.parse("E#3")).toStrictEqual([{ pitch: 65 }]); // → F3
      expect(parser.parse("Fb3")).toStrictEqual([{ pitch: 64 }]); // → E3
      expect(parser.parse("B#3")).toStrictEqual([{ pitch: 72 }]); // → C4 (up)
      expect(parser.parse("Cb3")).toStrictEqual([{ pitch: 59 }]); // → B2 (down)
    });

    it("accepts case-insensitive note names", () => {
      expect(parser.parse("c3 eb3 f#3 gb1")).toStrictEqual([
        { pitch: 60 }, // c3
        { pitch: 63 }, // eb3
        { pitch: 66 }, // f#3
        { pitch: 42 }, // gb1
      ]);
      // An all-caps spelling still reads the uppercase B as a flat.
      expect(parser.parse("GB1")).toStrictEqual([{ pitch: 42 }]); // Gb1
    });

    it("accepts Unicode ♯/♭ accidentals", () => {
      expect(parser.parse("C♯1 D♭1")).toStrictEqual([
        { pitch: 37 }, // C#1
        { pitch: 37 }, // Db1
      ]);
    });

    it("still rejects a non-letter or double accidental", () => {
      expect(() => parser.parse("H3")).toThrow('but "H" found');
      expect(() => parser.parse("Cbb3")).toThrow('but "C" found');
      expect(() => parser.parse("C##3")).toThrow('but "C" found');
    });
  });

  describe("probability", () => {
    it("accepts valid probability values", () => {
      expect(parser.parse("p0.0 C3 p0.5 D3 p1.0 E3")).toStrictEqual([
        { probability: 0.0 },
        { pitch: 60 },
        { probability: 0.5 },
        { pitch: 62 },
        { probability: 1.0 },
        { pitch: 64 },
      ]);
    });

    it("parses out-of-range probability (range enforced in interpreter)", () => {
      expect(parser.parse("p1.5 C3")).toStrictEqual([
        { probability: 1.5 },
        { pitch: 60 },
      ]);
    });
  });

  describe("velocity", () => {
    it("accepts valid MIDI velocity", () => {
      expect(parser.parse("v0 C3 v127 D3")).toStrictEqual([
        { velocity: 0 },
        { pitch: 60 },
        { velocity: 127 },
        { pitch: 62 },
      ]);
    });

    it("accepts valid velocity ranges", () => {
      expect(parser.parse("v80-120 C3 v1-127 D3")).toStrictEqual([
        { velocityMin: 80, velocityMax: 120 },
        { pitch: 60 },
        { velocityMin: 1, velocityMax: 127 },
        { pitch: 62 },
      ]);
    });

    it("rejects velocity ranges with a 0 lower bound (v0 is the delete sentinel)", () => {
      // `vA-B` desugars to base velocity = min(start,end); base velocity 0 is the
      // delete sentinel, so a 0 lower bound would silently delete every note.
      // The single `min === 0` guard covers both orderings and equal bounds.
      const v0Error =
        /velocity ranges must start at 1 or higher — v0 is the delete sentinel/;

      expect(() => parser.parse("v0-100 C3")).toThrow(v0Error);
      expect(() => parser.parse("v100-0 C3")).toThrow(v0Error);
      expect(() => parser.parse("v0-0 C3")).toThrow(v0Error);
      // The message echoes the offending token verbatim.
      expect(() => parser.parse("v0-100 C3")).toThrow(/"v0-100" is invalid/);
    });

    it("parses out-of-range velocity (range enforced in interpreter)", () => {
      expect(parser.parse("v128 C3")).toStrictEqual([
        { velocity: 128 },
        { pitch: 60 },
      ]);
    });

    it("parses out-of-range velocity ranges (range enforced in interpreter)", () => {
      expect(parser.parse("v128-130 C3")).toStrictEqual([
        { velocityMin: 128, velocityMax: 130 },
        { pitch: 60 },
      ]);
      expect(parser.parse("v1-128 C3")).toStrictEqual([
        { velocityMin: 1, velocityMax: 128 },
        { pitch: 60 },
      ]);
    });

    it("rejects negative velocity (malformed syntax)", () => {
      expect(() => parser.parse("v-1 C3")).toThrow('but "v" found');
    });
  });
});
