// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

// Resolve a ±n offset beat the way the grammar does: base + (num/den)*denom.
// Mirrors the float arithmetic so toStrictEqual matches bit-for-bit.
const obeat = (base: number, num: number, den: number, denom = 4): number =>
  base + (num / den) * denom;

describe("BarBeatScript Parser - beat lists", () => {
  describe("comma-separated beat lists", () => {
    it("parses note-value offset beats in comma-separated lists", () => {
      // ±n offsets are whole-note fractions; at the default 4/4, +n/12 = +1/3 beat
      expect(parser.parse("1|1+n/12,1+n/6,2+n/12")).toStrictEqual([
        { bar: 1, beat: obeat(1, 1, 12) },
        { bar: 1, beat: obeat(1, 1, 6) },
        { bar: 1, beat: obeat(2, 1, 12) },
      ]);
    });

    it("parses mixed decimal and offset beats in comma-separated lists", () => {
      expect(parser.parse("1|1,1+n/12,1.5,1+n/6")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: obeat(1, 1, 12) },
        { bar: 1, beat: 1.5 },
        { bar: 1, beat: obeat(1, 1, 6) },
      ]);
    });

    it("parses beat list with explicit bar", () => {
      expect(parser.parse("1|1,2,3,4")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: 3 },
        { bar: 1, beat: 4 },
      ]);
    });

    it("parses beat list with floating point beats", () => {
      expect(parser.parse("1|1,1.5,2,2.5")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: 1.5 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: 2.5 },
      ]);
    });

    it("parses single beat (list of one)", () => {
      expect(parser.parse("1|1")).toStrictEqual([{ bar: 1, beat: 1 }]);
    });

    it("parses beat list with two beats", () => {
      expect(parser.parse("1|1,3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: 3 },
      ]);
    });

    it("parses multiple beat lists in sequence", () => {
      expect(parser.parse("1|1,3 2|1,3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: 3 },
        { bar: 2, beat: 1 },
        { bar: 2, beat: 3 },
      ]);
    });

    it("rejects beat list without bar number", () => {
      expect(() => parser.parse("|1,2,3,4")).toThrow();
      expect(() => parser.parse("1|1,2 |3 |4")).toThrow();
    });

    it("parses beat lists with notes", () => {
      expect(parser.parse("C1 1|1,2,3,4")).toStrictEqual([
        { pitch: 36 },
        { bar: 1, beat: 1 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: 3 },
        { bar: 1, beat: 4 },
      ]);
    });

    it("does not allow whitespace around commas", () => {
      expect(() => parser.parse("1|1, 2, 3")).toThrow();
      expect(() => parser.parse("1|1 ,2 ,3")).toThrow();
    });

    it("parses note-value durations with note-value offset positions", () => {
      expect(parser.parse("n1/3 C3 1|1,1+n/12,1+n/6")).toStrictEqual([
        { duration: 1 / 3 },
        { pitch: 60 },
        { bar: 1, beat: 1 },
        { bar: 1, beat: obeat(1, 1, 12) },
        { bar: 1, beat: obeat(1, 1, 6) },
      ]);
    });
  });

  describe("integration - note-value offset notation", () => {
    it("parses triplet pattern with note-value durations and offset positions", () => {
      expect(
        parser.parse("n1/3 C3 1|1 1|1+n/12 1|1+n/6 D3 1|2 1|2+n/12 1|2+n/6"),
      ).toStrictEqual([
        { duration: 1 / 3 },
        { pitch: 60 },
        { bar: 1, beat: 1 },
        { bar: 1, beat: obeat(1, 1, 12) },
        { bar: 1, beat: obeat(1, 1, 6) },
        { pitch: 62 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: obeat(2, 1, 12) },
        { bar: 1, beat: obeat(2, 1, 6) },
      ]);
    });

    it("parses a mix of offset and decimal beat positions", () => {
      expect(
        parser.parse("n1/4 C3 1|1,1+n/16,1.5,1.75 n/2 D3 1|2,2.5,3,3.5"),
      ).toStrictEqual([
        { duration: 1 / 4 },
        { pitch: 60 },
        { bar: 1, beat: 1 },
        { bar: 1, beat: 5 / 4 },
        { bar: 1, beat: 3 / 2 },
        { bar: 1, beat: 7 / 4 },
        { duration: 1 / 2 },
        { pitch: 62 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: 2.5 },
        { bar: 1, beat: 3 },
        { bar: 1, beat: 3.5 },
      ]);
    });

    it("parses complex drum pattern with beat lists", () => {
      expect(
        parser.parse("C1 1|1,3 D1 1|2,4 F#1 1|1,1.5,2,2.5,3,3.5,4,4.5"),
      ).toStrictEqual([
        { pitch: 36 }, // C1 - kick
        { bar: 1, beat: 1 },
        { bar: 1, beat: 3 },
        { pitch: 38 }, // D1 - snare
        { bar: 1, beat: 2 },
        { bar: 1, beat: 4 },
        { pitch: 42 }, // F#1 - hi-hat
        { bar: 1, beat: 1 },
        { bar: 1, beat: 1.5 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: 2.5 },
        { bar: 1, beat: 3 },
        { bar: 1, beat: 3.5 },
        { bar: 1, beat: 4 },
        { bar: 1, beat: 4.5 },
      ]);
    });
  });
});
