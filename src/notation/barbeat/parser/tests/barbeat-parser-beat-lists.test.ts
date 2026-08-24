// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";
import { obeat } from "./barbeat-parser-test-helpers.ts";

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
      expect(() => parser.parse("|1,2,3,4")).toThrow('but "|" found');
      expect(() => parser.parse("1|1,2 |3 |4")).toThrow('but "|" found');
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

    it("allows horizontal whitespace around commas", () => {
      // Forgiving-parser nicety: `1|1, 2, 3` is the form an LLM naturally writes.
      const expected = [
        { bar: 1, beat: 1 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: 3 },
      ];

      expect(parser.parse("1|1, 2, 3")).toStrictEqual(expected);
      expect(parser.parse("1|1 ,2 ,3")).toStrictEqual(expected);
      expect(parser.parse("1|1 , 2 , 3")).toStrictEqual(expected);
    });

    it("tolerates a single trailing comma", () => {
      const expected = [
        { bar: 1, beat: 1 },
        { bar: 1, beat: 2 },
      ];

      expect(parser.parse("1|1,2,")).toStrictEqual(expected);
      expect(parser.parse("1|1, 2, ")).toStrictEqual(expected);
    });

    it("does not absorb the newline that separates two beat lists", () => {
      // A trailing comma + newline keeps the next bar|beat a separate element,
      // not a spaced continuation (hs is horizontal-only).
      expect(parser.parse("1|1,2\n2|3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: 2 },
        { bar: 2, beat: 3 },
      ]);
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

  describe("sticky-bar comma lists (per-item bar|)", () => {
    it("accepts an item that restates the same bar (8|2,8|2.5)", () => {
      expect(parser.parse("8|2,8|2.5")).toStrictEqual([
        { bar: 8, beat: 2 },
        { bar: 8, beat: 2.5 },
      ]);
    });

    it("accepts a cross-bar item (1|1,2|3)", () => {
      expect(parser.parse("1|1,2|3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 2, beat: 3 },
      ]);
    });

    it("makes the bar sticky: a bare item inherits the most-recent bar", () => {
      // 1|1,2|1,3 → after 2|1 the running bar is 2, so the bare 3 is 2|3.
      expect(parser.parse("1|1,2|1,3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 2, beat: 1 },
        { bar: 2, beat: 3 },
      ]);
    });

    it("accepts an all-explicit list", () => {
      expect(parser.parse("1|1,2|1,3|1,4|1")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 2, beat: 1 },
        { bar: 3, beat: 1 },
        { bar: 4, beat: 1 },
      ]);
    });

    it("groups bare items under each preceding explicit bar (1|1,2,2|1,2)", () => {
      expect(parser.parse("1|1,2,2|1,2")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: 2 },
        { bar: 2, beat: 1 },
        { bar: 2, beat: 2 },
      ]);
    });

    it("combines an explicit-bar item with whitespace and a trailing comma", () => {
      expect(parser.parse("1|1, 2|3, ")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 2, beat: 3 },
      ]);
    });

    it("still rejects a comma item that is not a beat or bar|beat", () => {
      expect(() => parser.parse("1|1,foo")).toThrow('but "f" found');
      expect(() => parser.parse("1|1,|2")).toThrow('but "|" found');
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
