import { describe, expect, it } from "vitest";
import type { FunctionNode } from "#src/notation/modulation/parser/modulation-parser-wrapper.ts";
import * as parser from "#src/notation/modulation/parser/modulation-parser-wrapper.ts";

describe("Modulation Parser - Expressions", () => {
  describe("function calls", () => {
    it("parses cos with frequency", () => {
      const result = parser.parse("velocity += cos(1t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "period", bars: 0, beats: 1 }],
      });
    });

    it("parses cos with frequency and phase", () => {
      const result = parser.parse("velocity += cos(1t, 0.5)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "period", bars: 0, beats: 1 }, 0.5],
      });
    });

    it("parses tri with frequency", () => {
      const result = parser.parse("velocity += tri(2t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "tri",
        args: [{ type: "period", bars: 0, beats: 2 }],
      });
    });

    it("parses saw with frequency and phase", () => {
      const result = parser.parse("velocity += saw(0.5t, 0.25)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "saw",
        args: [{ type: "period", bars: 0, beats: 0.5 }, 0.25],
      });
    });

    it("parses square with frequency", () => {
      const result = parser.parse("velocity += square(4t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "period", bars: 0, beats: 4 }],
      });
    });

    it("parses square with frequency and phase", () => {
      const result = parser.parse("velocity += square(1t, 0.25)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "period", bars: 0, beats: 1 }, 0.25],
      });
    });

    it("parses square with frequency, phase, and pulseWidth", () => {
      const result = parser.parse("velocity += square(2t, 0, 0.75)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "period", bars: 0, beats: 2 }, 0, 0.75],
      });
    });

    it("parses noise with no arguments", () => {
      const result = parser.parse("velocity += noise()");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "noise",
        args: [],
      });
    });
  });

  describe("frequency parameters", () => {
    it("parses beat-only frequency (1t)", () => {
      const result = parser.parse("velocity += cos(1t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 0,
        beats: 1,
      });
    });

    it("parses beat-only frequency with decimal (0.5t)", () => {
      const result = parser.parse("velocity += cos(0.5t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 0,
        beats: 0.5,
      });
    });

    it("parses beat-only frequency with fraction (1/3t)", () => {
      const result = parser.parse("velocity += cos(1/3t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 0,
        beats: 1 / 3,
      });
    });

    it("parses beat-only frequency with fraction (optional numerator /3t)", () => {
      const result = parser.parse("velocity += cos(/3t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 0,
        beats: 1 / 3,
      });
    });

    it("parses beat-only frequency with fraction (optional numerator /4t)", () => {
      const result = parser.parse("velocity += cos(/4t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 0,
        beats: 1 / 4,
      });
    });

    it("parses bar:beat frequency (1:0t)", () => {
      const result = parser.parse("velocity += cos(1:0t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 1,
        beats: 0,
      });
    });

    it("parses bar:beat frequency (0:1t)", () => {
      const result = parser.parse("velocity += cos(0:1t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 0,
        beats: 1,
      });
    });

    it("parses bar:beat frequency with decimal beats (2:1.5t)", () => {
      const result = parser.parse("velocity += cos(2:1.5t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 2,
        beats: 1.5,
      });
    });

    it("parses bar:beat frequency with fraction beats (1:1/2t)", () => {
      const result = parser.parse("velocity += cos(1:1/2t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 1,
        beats: 0.5,
      });
    });

    it("parses bar:beat frequency with fraction beats (optional numerator 1:/2t)", () => {
      const result = parser.parse("velocity += cos(1:/2t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 1,
        beats: 0.5,
      });
    });

    it("parses bar:beat frequency with fraction beats (optional numerator 2:/3t)", () => {
      const result = parser.parse("velocity += cos(2:/3t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 2,
        beats: 1 / 3,
      });
    });

    it("parses large bar:beat frequency (4:0t)", () => {
      const result = parser.parse("velocity += cos(4:0t)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "period",
        bars: 4,
        beats: 0,
      });
    });
  });

  describe("arithmetic operators", () => {
    it("parses addition", () => {
      const result = parser.parse("velocity += 10 + 5");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: 10,
        right: 5,
      });
    });

    it("parses subtraction", () => {
      const result = parser.parse("velocity += 10 - 5");

      expect(result[0]!.expression).toStrictEqual({
        type: "subtract",
        left: 10,
        right: 5,
      });
    });

    it("parses multiplication", () => {
      const result = parser.parse("velocity += 10 * 2");

      expect(result[0]!.expression).toStrictEqual({
        type: "multiply",
        left: 10,
        right: 2,
      });
    });

    it("parses division", () => {
      const result = parser.parse("velocity += 10 / 2");

      expect(result[0]!.expression).toStrictEqual({
        type: "divide",
        left: 10,
        right: 2,
      });
    });

    it("parses multiplication before addition (precedence)", () => {
      const result = parser.parse("velocity += 10 + 5 * 2");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: 10,
        right: {
          type: "multiply",
          left: 5,
          right: 2,
        },
      });
    });

    it("parses division before subtraction (precedence)", () => {
      const result = parser.parse("velocity += 20 - 10 / 2");

      expect(result[0]!.expression).toStrictEqual({
        type: "subtract",
        left: 20,
        right: {
          type: "divide",
          left: 10,
          right: 2,
        },
      });
    });

    it("parses right-to-left for same precedence (addition)", () => {
      const result = parser.parse("velocity += 5 + 3 + 2");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: 5,
        right: {
          type: "add",
          left: 3,
          right: 2,
        },
      });
    });
  });

  describe("parentheses", () => {
    it("parses parentheses for grouping", () => {
      const result = parser.parse("velocity += (10 + 5) * 2");

      expect(result[0]!.expression).toStrictEqual({
        type: "multiply",
        left: {
          type: "add",
          left: 10,
          right: 5,
        },
        right: 2,
      });
    });

    it("parses nested parentheses", () => {
      const result = parser.parse("velocity += ((10 + 5) * 2) - 3");

      expect(result[0]!.expression).toStrictEqual({
        type: "subtract",
        left: {
          type: "multiply",
          left: {
            type: "add",
            left: 10,
            right: 5,
          },
          right: 2,
        },
        right: 3,
      });
    });
  });

  describe("complex expressions", () => {
    it("parses function with arithmetic", () => {
      const result = parser.parse("velocity += 20 * cos(1:0t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "multiply",
        left: 20,
        right: {
          type: "function",
          name: "cos",
          args: [{ type: "period", bars: 1, beats: 0 }],
        },
      });
    });

    it("parses multiple functions combined", () => {
      const result = parser.parse("velocity += 20 * cos(4:0t) + 10 * noise()");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: {
          type: "multiply",
          left: 20,
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "period", bars: 4, beats: 0 }],
          },
        },
        right: {
          type: "multiply",
          left: 10,
          right: {
            type: "function",
            name: "noise",
            args: [],
          },
        },
      });
    });

    it("parses unipolar envelope (offset + modulation)", () => {
      const result = parser.parse("velocity += 20 + 20 * cos(2:0t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: 20,
        right: {
          type: "multiply",
          left: 20,
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "period", bars: 2, beats: 0 }],
          },
        },
      });
    });

    it("parses amplitude modulation", () => {
      const result = parser.parse("velocity += 30 * cos(4:0t) * cos(1t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "multiply",
        left: 30,
        right: {
          type: "multiply",
          left: {
            type: "function",
            name: "cos",
            args: [{ type: "period", bars: 4, beats: 0 }],
          },
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "period", bars: 0, beats: 1 }],
          },
        },
      });
    });

    it("parses swing timing with subtraction", () => {
      const result = parser.parse("timing += 0.05 * (cos(1t) - 1)");

      expect(result[0]!.expression).toStrictEqual({
        type: "multiply",
        left: 0.05,
        right: {
          type: "subtract",
          left: {
            type: "function",
            name: "cos",
            args: [{ type: "period", bars: 0, beats: 1 }],
          },
          right: 1,
        },
      });
    });
  });
});
