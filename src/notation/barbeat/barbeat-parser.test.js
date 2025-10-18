import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser";

describe("BarBeatScript Parser", () => {
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
      expect(parser.parse("1|1 v100 t0.5 p0.8 C3 D3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { velocity: 100 },
        { duration: 0.5 },
        { probability: 0.8 },
        { pitch: 60 },
        { pitch: 62 },
      ]);
    });

    it("parses state-only input", () => {
      expect(parser.parse("2|3 v80 t0.25 p0.9")).toStrictEqual([
        { bar: 2, beat: 3 },
        { velocity: 80 },
        { duration: 0.25 },
        { probability: 0.9 },
      ]);
    });
  });

  describe("time declarations", () => {
    it("parses integer and floating point beats", () => {
      expect(parser.parse("1|1 C3 1|1.5 D3 1|2.25 E3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { pitch: 60 },
        { bar: 1, beat: 1.5 },
        { pitch: 62 },
        { bar: 1, beat: 2.25 },
        { pitch: 64 },
      ]);
    });

    it("parses fractional beats", () => {
      expect(parser.parse("1|4/3 C3 1|5/3 D3 1|7/3 E3")).toStrictEqual([
        { bar: 1, beat: 4 / 3 },
        { pitch: 60 },
        { bar: 1, beat: 5 / 3 },
        { pitch: 62 },
        { bar: 1, beat: 7 / 3 },
        { pitch: 64 },
      ]);
    });

    it("parses mixed decimal and fractional beats", () => {
      expect(parser.parse("1|1 C3 1|4/3 D3 1|1.5 E3 1|5/3 F3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { pitch: 60 },
        { bar: 1, beat: 4 / 3 },
        { pitch: 62 },
        { bar: 1, beat: 1.5 },
        { pitch: 64 },
        { bar: 1, beat: 5 / 3 },
        { pitch: 65 },
      ]);
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

    it("rejects out-of-range probability", () => {
      expect(() => parser.parse("p1.5 C3")).toThrow(
        "Note probability 1.5 outside valid range 0.0-1.0",
      );
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
      expect(parser.parse("v80-120 C3 v0-127 D3")).toStrictEqual([
        { velocityMin: 80, velocityMax: 120 },
        { pitch: 60 },
        { velocityMin: 0, velocityMax: 127 },
        { pitch: 62 },
      ]);
    });

    it("rejects out-of-range velocity", () => {
      expect(() => parser.parse("v128 C3")).toThrow(
        "MIDI velocity 128 outside valid range 0-127",
      );
    });

    it("rejects invalid velocity ranges", () => {
      expect(() => parser.parse("v128-130 C3")).toThrow(
        "Invalid velocity range 128-130",
      );
      expect(() => parser.parse("v0-128 C3")).toThrow(
        "Invalid velocity range 0-128",
      );
    });

    it("rejects negative velocity", () => {
      expect(() => parser.parse("v-1 C3")).toThrow(
        'Expected [0-9] but "-" found.',
      );
    });
  });

  describe("duration", () => {
    it("parses floating-point durations", () => {
      expect(parser.parse("t0.25 C3 t1.0 D3")).toStrictEqual([
        { duration: 0.25 },
        { pitch: 60 },
        { duration: 1.0 },
        { pitch: 62 },
      ]);
    });

    it("parses fractional durations", () => {
      expect(parser.parse("t1/3 C3 t2/3 D3 t4/3 E3")).toStrictEqual([
        { duration: 1 / 3 },
        { pitch: 60 },
        { duration: 2 / 3 },
        { pitch: 62 },
        { duration: 4 / 3 },
        { pitch: 64 },
      ]);
    });

    it("parses mixed decimal and fractional durations", () => {
      expect(parser.parse("t0.5 C3 t1/2 D3 t1.5 E3 t3/2 F3")).toStrictEqual([
        { duration: 0.5 },
        { pitch: 60 },
        { duration: 1 / 2 },
        { pitch: 62 },
        { duration: 1.5 },
        { pitch: 64 },
        { duration: 3 / 2 },
        { pitch: 65 },
      ]);
    });

    it("parses quintuplet durations", () => {
      expect(parser.parse("t1/5 C3 t2/5 D3")).toStrictEqual([
        { duration: 1 / 5 },
        { pitch: 60 },
        { duration: 2 / 5 },
        { pitch: 62 },
      ]);
    });

    it("parses zero duration with fraction notation", () => {
      expect(parser.parse("t0/1 C3")).toStrictEqual([
        { duration: 0 },
        { pitch: 60 },
      ]);
    });
  });

  describe("pitch", () => {
    it("rejects out-of-range MIDI pitch", () => {
      expect(() => parser.parse("C-3")).toThrow(/outside valid range/);
      expect(() => parser.parse("C9")).toThrow(/outside valid range/);
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

    it("doesn't support B#, Cb, E# or Fb", () => {
      expect(() => parser.parse("B#3")).toThrow();
      expect(() => parser.parse("Cb3")).toThrow();
      expect(() => parser.parse("E#3")).toThrow();
      expect(() => parser.parse("Fb3")).toThrow();
    });
  });

  describe("velocity range edge cases", () => {
    it("handles reversed velocity ranges correctly", () => {
      expect(parser.parse("v120-80 C3")).toStrictEqual([
        { velocityMin: 80, velocityMax: 120 },
        { pitch: 60 },
      ]);
    });

    it("handles same value velocity ranges", () => {
      expect(parser.parse("v100-100 C3")).toStrictEqual([
        { velocityMin: 100, velocityMax: 100 },
        { pitch: 60 },
      ]);
    });
  });

  describe("float parsing edge cases", () => {
    it("handles integer floats with trailing decimal in time", () => {
      expect(parser.parse("1|1.")).toStrictEqual([{ bar: 1, beat: 1 }]);
    });

    it("handles decimal-only floats in duration", () => {
      expect(parser.parse("t.25 C3")).toStrictEqual([
        { duration: 0.25 },
        { pitch: 60 },
      ]);
    });

    it("handles decimal-only floats in probability", () => {
      expect(parser.parse("p.5 C3")).toStrictEqual([
        { probability: 0.5 },
        { pitch: 60 },
      ]);
    });

    it("handles various float formats", () => {
      expect(parser.parse("p0.5 t1.25 v64")).toStrictEqual([
        { probability: 0.5 },
        { duration: 1.25 },
        { velocity: 64 },
      ]);
    });
  });

  describe("parser options and configuration", () => {
    it("throws error for invalid start rule", () => {
      expect(() => parser.parse("C3", { startRule: "invalid" })).toThrow(
        'Can\'t start parsing from rule "invalid".',
      );
    });

    it("returns library object when peg$library option is true", () => {
      const result = parser.parse("C3", { peg$library: true });
      expect(result).toHaveProperty("peg$result");
      expect(result).toHaveProperty("peg$success", true);
      expect(result).toHaveProperty("peg$currPos");
      expect(result).toHaveProperty("peg$FAILED");
      expect(result).toHaveProperty("peg$maxFailExpected");
      expect(result).toHaveProperty("peg$maxFailPos");
    });

    it("returns library object with throw function on parse failure", () => {
      const result = parser.parse("X3", { peg$library: true });
      expect(result).toHaveProperty("peg$success", false);
      expect(result).toHaveProperty("peg$throw");
      expect(typeof result.peg$throw).toBe("function");
    });
  });

  describe("syntax error formatting", () => {
    it("formats syntax errors with source context", () => {
      try {
        parser.parse("1|1 X3", { grammarSource: "test.txt" });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.name).toBe("SyntaxError");
        expect(error.location).toBeDefined();
        expect(error.location.start.line).toBe(1);
        expect(error.location.start.column).toBe(5);
      }
    });

    it("formats errors with custom source", () => {
      try {
        parser.parse("1|1 X3");
        expect.fail("Should have thrown an error");
      } catch (error) {
        const formatted = error.format([{ source: undefined, text: "1|1 X3" }]);
        expect(formatted).toContain("Error:");
        expect(formatted).toContain("1|1 X3");
        expect(formatted).toContain("^");
      }
    });

    it("handles formatting without source text", () => {
      try {
        parser.parse("1|1 X3", { grammarSource: "test.txt" });
        expect.fail("Should have thrown an error");
      } catch (error) {
        const formatted = error.format([]);
        expect(formatted).toContain("at test.txt:1:5");
      }
    });

    it("handles multiple expectation error messages", () => {
      try {
        parser.parse("1:");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toMatch(/Expected .* but .* found/);
      }
    });

    it("handles end of input errors", () => {
      try {
        parser.parse("C");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toContain("end of input");
      }
    });
  });

  describe("special character handling", () => {
    it("handles tab and newline characters in input", () => {
      expect(parser.parse("C3\t\nD3")).toStrictEqual([
        { pitch: 60 },
        { pitch: 62 },
      ]);
    });

    it("handles carriage return characters", () => {
      expect(parser.parse("C3\r\nD3")).toStrictEqual([
        { pitch: 60 },
        { pitch: 62 },
      ]);
    });

    it("rejects invalid characters with proper error messages", () => {
      expect(() => parser.parse("1|1 @")).toThrow();
      expect(() => parser.parse("1|1 $")).toThrow();
      expect(() => parser.parse("1|1 %")).toThrow();
    });

    it("handles control characters in error messages", () => {
      expect(() => parser.parse("1|1 \x00")).toThrow();
      expect(() => parser.parse("1|1 \x1F")).toThrow();
    });
  });

  describe("advanced parser features", () => {
    it("handles complex multi-line input with mixed whitespace", () => {
      const input = `1|1 v100 C3
        1|2\t\tD3
        
        2|1 v80 E3`;
      expect(parser.parse(input)).toStrictEqual([
        { bar: 1, beat: 1 },
        { velocity: 100 },
        { pitch: 60 },
        { bar: 1, beat: 2 },
        { pitch: 62 },
        { bar: 2, beat: 1 },
        { velocity: 80 },
        { pitch: 64 },
      ]);
    });

    it("handles incomplete input gracefully", () => {
      expect(() => parser.parse("1:")).toThrow();
      expect(() => parser.parse("v")).toThrow();
      expect(() => parser.parse("p")).toThrow();
      expect(() => parser.parse("t")).toThrow();
    });

    it("handles zero values correctly", () => {
      expect(parser.parse("1|1 v0 p0.0 t0.0 C0")).toStrictEqual([
        { bar: 1, beat: 1 },
        { velocity: 0 },
        { probability: 0.0 },
        { duration: 0.0 },
        { pitch: 24 },
      ]);
    });

    it("handles maximum values correctly", () => {
      expect(parser.parse("999|999.999 v127 p1.0 t999.999 G8")).toStrictEqual([
        { bar: 999, beat: 999.999 },
        { velocity: 127 },
        { probability: 1.0 },
        { duration: 999.999 },
        { pitch: 127 },
      ]);
    });
  });

  describe("integration", () => {
    it("handles real-world drum pattern example with probability and velocity range", () => {
      const input = `
        1|1 v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1
        1|1.5 p0.6 Gb1
        2|2 v90 p1.0 D1
        v100 p0.9 Gb1
      `;
      expect(parser.parse(input)).toStrictEqual([
        { bar: 1, beat: 1 },
        { velocity: 100 },
        { duration: 0.25 },
        { probability: 1.0 },
        { pitch: 36 },
        { velocityMin: 80, velocityMax: 100 },
        { probability: 0.8 },
        { pitch: 42 },
        { bar: 1, beat: 1.5 },
        { probability: 0.6 },
        { pitch: 42 },
        { bar: 2, beat: 2 },
        { velocity: 90 },
        { probability: 1.0 },
        { pitch: 38 },
        { velocity: 100 },
        { probability: 0.9 },
        { pitch: 42 },
      ]);
    });
  });

  describe("bar copy", () => {
    it("parses single bar copy", () => {
      expect(parser.parse("@5=1")).toStrictEqual([
        { barCopy: 5, sourceBar: 1 },
      ]);
    });

    it("parses range copy", () => {
      expect(parser.parse("@5=1-4")).toStrictEqual([
        { barCopy: 5, sourceRange: [1, 4] },
      ]);
    });

    it("parses previous bar copy", () => {
      expect(parser.parse("@2=")).toStrictEqual([
        { barCopy: 2, sourcePrevious: true },
      ]);
    });

    it("parses clear buffer", () => {
      expect(parser.parse("@clear")).toStrictEqual([{ clearBuffer: true }]);
    });

    it("parses chained copies", () => {
      expect(parser.parse("@2= @3= @4=")).toStrictEqual([
        { barCopy: 2, sourcePrevious: true },
        { barCopy: 3, sourcePrevious: true },
        { barCopy: 4, sourcePrevious: true },
      ]);
    });

    it("parses mixed with notes and time", () => {
      expect(parser.parse("C3 1|1 @2=1 D3 2|1")).toStrictEqual([
        { pitch: 60 },
        { bar: 1, beat: 1 },
        { barCopy: 2, sourceBar: 1 },
        { pitch: 62 },
        { bar: 2, beat: 1 },
      ]);
    });
  });

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
