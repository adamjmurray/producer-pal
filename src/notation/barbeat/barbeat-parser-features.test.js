import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser.js";

describe("BarBeatScript Parser - parser features", () => {
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
});
