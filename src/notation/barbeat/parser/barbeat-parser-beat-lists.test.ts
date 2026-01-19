import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser.js";

describe("BarBeatScript Parser - beat lists", () => {
  describe("comma-separated beat lists", () => {
    it("parses fractional beats in comma-separated lists", () => {
      expect(parser.parse("1|4/3,5/3,7/3")).toStrictEqual([
        { bar: 1, beat: 4 / 3 },
        { bar: 1, beat: 5 / 3 },
        { bar: 1, beat: 7 / 3 },
      ]);
    });

    it("parses mixed decimal and fractional in comma-separated lists", () => {
      expect(parser.parse("1|1,4/3,1.5,5/3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: 4 / 3 },
        { bar: 1, beat: 1.5 },
        { bar: 1, beat: 5 / 3 },
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

    it("parses beat list with bar shorthand", () => {
      expect(parser.parse("|1,2,3,4")).toStrictEqual([
        { bar: null, beat: 1 },
        { bar: null, beat: 2 },
        { bar: null, beat: 3 },
        { bar: null, beat: 4 },
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

    it("parses beat lists mixed with single beats", () => {
      expect(parser.parse("1|1,2 |3 |4")).toStrictEqual([
        { bar: 1, beat: 1 },
        { bar: 1, beat: 2 },
        { bar: null, beat: 3 },
        { bar: null, beat: 4 },
      ]);
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

    it("parses fractional durations with fractional beat positions", () => {
      expect(parser.parse("t1/3 C3 1|1,4/3,5/3")).toStrictEqual([
        { duration: 1 / 3 },
        { pitch: 60 },
        { bar: 1, beat: 1 },
        { bar: 1, beat: 4 / 3 },
        { bar: 1, beat: 5 / 3 },
      ]);
    });
  });

  describe("integration - fractional notation", () => {
    it("parses triplet pattern with fractional durations and positions", () => {
      expect(
        parser.parse("t1/3 C3 1|1 1|4/3 1|5/3 D3 1|2 1|7/3 1|8/3"),
      ).toStrictEqual([
        { duration: 1 / 3 },
        { pitch: 60 },
        { bar: 1, beat: 1 },
        { bar: 1, beat: 4 / 3 },
        { bar: 1, beat: 5 / 3 },
        { pitch: 62 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: 7 / 3 },
        { bar: 1, beat: 8 / 3 },
      ]);
    });

    it("parses mixed fractional and decimal notation throughout", () => {
      expect(
        parser.parse("t1/4 C3 1|1,5/4,3/2,7/4 t0.5 D3 1|2,2.5,3,3.5"),
      ).toStrictEqual([
        { duration: 1 / 4 },
        { pitch: 60 },
        { bar: 1, beat: 1 },
        { bar: 1, beat: 5 / 4 },
        { bar: 1, beat: 3 / 2 },
        { bar: 1, beat: 7 / 4 },
        { duration: 0.5 },
        { pitch: 62 },
        { bar: 1, beat: 2 },
        { bar: 1, beat: 2.5 },
        { bar: 1, beat: 3 },
        { bar: 1, beat: 3.5 },
      ]);
    });

    it("parses complex drum pattern with beat lists", () => {
      expect(
        parser.parse("C1 1|1,3 D1 |2,4 F#1 |1,1.5,2,2.5,3,3.5,4,4.5"),
      ).toStrictEqual([
        { pitch: 36 }, // C1 - kick
        { bar: 1, beat: 1 },
        { bar: 1, beat: 3 },
        { pitch: 38 }, // D1 - snare
        { bar: null, beat: 2 },
        { bar: null, beat: 4 },
        { pitch: 42 }, // F#1 - hi-hat
        { bar: null, beat: 1 },
        { bar: null, beat: 1.5 },
        { bar: null, beat: 2 },
        { bar: null, beat: 2.5 },
        { bar: null, beat: 3 },
        { bar: null, beat: 3.5 },
        { bar: null, beat: 4 },
        { bar: null, beat: 4.5 },
      ]);
    });
  });
});
