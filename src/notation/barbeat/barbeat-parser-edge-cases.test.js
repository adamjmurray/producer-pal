import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser.js";

describe("BarBeatScript Parser - edge cases", () => {
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
});
