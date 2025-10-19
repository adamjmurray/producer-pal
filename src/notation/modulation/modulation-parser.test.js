import { describe, expect, it } from "vitest";
import * as parser from "./modulation-parser.js";

describe("Modulation Parser", () => {
  describe("basic structure", () => {
    it("parses an empty input", () => {
      expect(parser.parse("")).toStrictEqual([]);
      expect(parser.parse("  \t ")).toStrictEqual([]);
    });

    it("parses single parameter assignment", () => {
      const result = parser.parse("velocity: 10");
      expect(result).toStrictEqual([{ parameter: "velocity", expression: 10 }]);
    });

    it("parses multiple parameter assignments", () => {
      const result = parser.parse("velocity: 10\ntiming: 0.05");
      expect(result).toStrictEqual([
        { parameter: "velocity", expression: 10 },
        { parameter: "timing", expression: 0.05 },
      ]);
    });

    it("parses all parameter types", () => {
      const result = parser.parse(
        "velocity: 1\ntiming: 2\nduration: 3\nprobability: 4",
      );
      expect(result).toStrictEqual([
        { parameter: "velocity", expression: 1 },
        { parameter: "timing", expression: 2 },
        { parameter: "duration", expression: 3 },
        { parameter: "probability", expression: 4 },
      ]);
    });
  });

  describe("numbers", () => {
    it("parses positive integers", () => {
      const result = parser.parse("velocity: 100");
      expect(result[0].expression).toBe(100);
    });

    it("parses negative integers", () => {
      const result = parser.parse("velocity: -50");
      expect(result[0].expression).toBe(-50);
    });

    it("parses positive floats", () => {
      const result = parser.parse("velocity: 10.5");
      expect(result[0].expression).toBe(10.5);
    });

    it("parses negative floats", () => {
      const result = parser.parse("timing: -0.05");
      expect(result[0].expression).toBe(-0.05);
    });

    it("parses floats without leading zero", () => {
      const result = parser.parse("probability: .5");
      expect(result[0].expression).toBe(0.5);
    });
  });

  describe("function calls", () => {
    it("parses cos with frequency", () => {
      const result = parser.parse("velocity: cos(1t)");
      expect(result[0].expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "frequency", bars: 0, beats: 1 }],
      });
    });

    it("parses cos with frequency and phase", () => {
      const result = parser.parse("velocity: cos(1t, 0.5)");
      expect(result[0].expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "frequency", bars: 0, beats: 1 }, 0.5],
      });
    });

    it("parses tri with frequency", () => {
      const result = parser.parse("velocity: tri(2t)");
      expect(result[0].expression).toStrictEqual({
        type: "function",
        name: "tri",
        args: [{ type: "frequency", bars: 0, beats: 2 }],
      });
    });

    it("parses saw with frequency and phase", () => {
      const result = parser.parse("velocity: saw(0.5t, 0.25)");
      expect(result[0].expression).toStrictEqual({
        type: "function",
        name: "saw",
        args: [{ type: "frequency", bars: 0, beats: 0.5 }, 0.25],
      });
    });

    it("parses square with frequency", () => {
      const result = parser.parse("velocity: square(4t)");
      expect(result[0].expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "frequency", bars: 0, beats: 4 }],
      });
    });

    it("parses square with frequency and phase", () => {
      const result = parser.parse("velocity: square(1t, 0.25)");
      expect(result[0].expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "frequency", bars: 0, beats: 1 }, 0.25],
      });
    });

    it("parses square with frequency, phase, and pulseWidth", () => {
      const result = parser.parse("velocity: square(2t, 0, 0.75)");
      expect(result[0].expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "frequency", bars: 0, beats: 2 }, 0, 0.75],
      });
    });

    it("parses noise with no arguments", () => {
      const result = parser.parse("velocity: noise()");
      expect(result[0].expression).toStrictEqual({
        type: "function",
        name: "noise",
        args: [],
      });
    });
  });

  describe("frequency parameters", () => {
    it("parses beat-only frequency (1t)", () => {
      const result = parser.parse("velocity: cos(1t)");
      expect(result[0].expression.args[0]).toStrictEqual({
        type: "frequency",
        bars: 0,
        beats: 1,
      });
    });

    it("parses beat-only frequency with decimal (0.5t)", () => {
      const result = parser.parse("velocity: cos(0.5t)");
      expect(result[0].expression.args[0]).toStrictEqual({
        type: "frequency",
        bars: 0,
        beats: 0.5,
      });
    });

    it("parses beat-only frequency with fraction (1/3t)", () => {
      const result = parser.parse("velocity: cos(1/3t)");
      expect(result[0].expression.args[0]).toStrictEqual({
        type: "frequency",
        bars: 0,
        beats: 1 / 3,
      });
    });

    it("parses bar:beat frequency (1:0t)", () => {
      const result = parser.parse("velocity: cos(1:0t)");
      expect(result[0].expression.args[0]).toStrictEqual({
        type: "frequency",
        bars: 1,
        beats: 0,
      });
    });

    it("parses bar:beat frequency (0:1t)", () => {
      const result = parser.parse("velocity: cos(0:1t)");
      expect(result[0].expression.args[0]).toStrictEqual({
        type: "frequency",
        bars: 0,
        beats: 1,
      });
    });

    it("parses bar:beat frequency with decimal beats (2:1.5t)", () => {
      const result = parser.parse("velocity: cos(2:1.5t)");
      expect(result[0].expression.args[0]).toStrictEqual({
        type: "frequency",
        bars: 2,
        beats: 1.5,
      });
    });

    it("parses bar:beat frequency with fraction beats (1:1/2t)", () => {
      const result = parser.parse("velocity: cos(1:1/2t)");
      expect(result[0].expression.args[0]).toStrictEqual({
        type: "frequency",
        bars: 1,
        beats: 0.5,
      });
    });

    it("parses large bar:beat frequency (4:0t)", () => {
      const result = parser.parse("velocity: cos(4:0t)");
      expect(result[0].expression.args[0]).toStrictEqual({
        type: "frequency",
        bars: 4,
        beats: 0,
      });
    });
  });

  describe("arithmetic operators", () => {
    it("parses addition", () => {
      const result = parser.parse("velocity: 10 + 5");
      expect(result[0].expression).toStrictEqual({
        type: "add",
        left: 10,
        right: 5,
      });
    });

    it("parses subtraction", () => {
      const result = parser.parse("velocity: 10 - 5");
      expect(result[0].expression).toStrictEqual({
        type: "subtract",
        left: 10,
        right: 5,
      });
    });

    it("parses multiplication", () => {
      const result = parser.parse("velocity: 10 * 2");
      expect(result[0].expression).toStrictEqual({
        type: "multiply",
        left: 10,
        right: 2,
      });
    });

    it("parses division", () => {
      const result = parser.parse("velocity: 10 / 2");
      expect(result[0].expression).toStrictEqual({
        type: "divide",
        left: 10,
        right: 2,
      });
    });

    it("parses multiplication before addition (precedence)", () => {
      const result = parser.parse("velocity: 10 + 5 * 2");
      expect(result[0].expression).toStrictEqual({
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
      const result = parser.parse("velocity: 20 - 10 / 2");
      expect(result[0].expression).toStrictEqual({
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
      const result = parser.parse("velocity: 5 + 3 + 2");
      expect(result[0].expression).toStrictEqual({
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
      const result = parser.parse("velocity: (10 + 5) * 2");
      expect(result[0].expression).toStrictEqual({
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
      const result = parser.parse("velocity: ((10 + 5) * 2) - 3");
      expect(result[0].expression).toStrictEqual({
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
      const result = parser.parse("velocity: 20 * cos(1:0t)");
      expect(result[0].expression).toStrictEqual({
        type: "multiply",
        left: 20,
        right: {
          type: "function",
          name: "cos",
          args: [{ type: "frequency", bars: 1, beats: 0 }],
        },
      });
    });

    it("parses multiple functions combined", () => {
      const result = parser.parse("velocity: 20 * cos(4:0t) + 10 * noise()");
      expect(result[0].expression).toStrictEqual({
        type: "add",
        left: {
          type: "multiply",
          left: 20,
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "frequency", bars: 4, beats: 0 }],
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
      const result = parser.parse("velocity: 20 + 20 * cos(2:0t)");
      expect(result[0].expression).toStrictEqual({
        type: "add",
        left: 20,
        right: {
          type: "multiply",
          left: 20,
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "frequency", bars: 2, beats: 0 }],
          },
        },
      });
    });

    it("parses amplitude modulation", () => {
      const result = parser.parse("velocity: 30 * cos(4:0t) * cos(1t)");
      expect(result[0].expression).toStrictEqual({
        type: "multiply",
        left: 30,
        right: {
          type: "multiply",
          left: {
            type: "function",
            name: "cos",
            args: [{ type: "frequency", bars: 4, beats: 0 }],
          },
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "frequency", bars: 0, beats: 1 }],
          },
        },
      });
    });

    it("parses swing timing with subtraction", () => {
      const result = parser.parse("timing: 0.05 * (cos(1t) - 1)");
      expect(result[0].expression).toStrictEqual({
        type: "multiply",
        left: 0.05,
        right: {
          type: "subtract",
          left: {
            type: "function",
            name: "cos",
            args: [{ type: "frequency", bars: 0, beats: 1 }],
          },
          right: 1,
        },
      });
    });
  });

  describe("whitespace and comments", () => {
    it("handles whitespace around operators", () => {
      const result = parser.parse("velocity:   10   +   5");
      expect(result[0].expression).toStrictEqual({
        type: "add",
        left: 10,
        right: 5,
      });
    });

    it("handles multiple blank lines between assignments", () => {
      const result = parser.parse("velocity: 10\n\n\ntiming: 0.05");
      expect(result).toStrictEqual([
        { parameter: "velocity", expression: 10 },
        { parameter: "timing", expression: 0.05 },
      ]);
    });

    it("handles line comments", () => {
      const result = parser.parse("velocity: 10 // this is a comment");
      expect(result[0].expression).toBe(10);
    });

    it("handles hash comments", () => {
      const result = parser.parse("velocity: 10 # this is a comment");
      expect(result[0].expression).toBe(10);
    });

    it("handles block comments", () => {
      const result = parser.parse("velocity: 10 /* block comment */");
      expect(result[0].expression).toBe(10);
    });

    it("handles comments on separate lines", () => {
      const result = parser.parse(
        "// comment\nvelocity: 10\n// another comment\ntiming: 0.05",
      );
      expect(result).toStrictEqual([
        { parameter: "velocity", expression: 10 },
        { parameter: "timing", expression: 0.05 },
      ]);
    });
  });

  describe("error cases", () => {
    it("throws on invalid parameter name", () => {
      expect(() => parser.parse("invalid: 10")).toThrow();
    });

    it("throws on missing expression", () => {
      expect(() => parser.parse("velocity:")).toThrow();
    });

    it("throws on invalid function name", () => {
      expect(() => parser.parse("velocity: invalid(1t)")).toThrow();
    });

    it("accepts plain number as function argument", () => {
      // Plain numbers are valid (e.g., for phase or pulseWidth)
      const result = parser.parse("velocity: cos(1t, 0.5)");
      expect(result[0].expression.args[1]).toBe(0.5);
    });

    it("throws on unclosed parenthesis", () => {
      expect(() => parser.parse("velocity: (10 + 5")).toThrow();
    });

    it("throws on unmatched closing parenthesis", () => {
      expect(() => parser.parse("velocity: 10 + 5)")).toThrow();
    });
  });

  describe("real-world examples from spec", () => {
    it("parses basic envelope", () => {
      const result = parser.parse("velocity: 20 * cos(1:0t)");
      expect(result[0].parameter).toBe("velocity");
      expect(result[0].expression.type).toBe("multiply");
    });

    it("parses phase-shifted envelope", () => {
      const result = parser.parse("velocity: 20 * cos(1:0t, 0.5)");
      expect(result[0].expression.right.args).toHaveLength(2);
      expect(result[0].expression.right.args[1]).toBe(0.5);
    });

    it("parses pulse width modulation", () => {
      const result = parser.parse("velocity: 20 * square(2t, 0, 0.25)");
      expect(result[0].expression.right.name).toBe("square");
      expect(result[0].expression.right.args).toHaveLength(3);
      expect(result[0].expression.right.args[2]).toBe(0.25);
    });

    it("parses multi-parameter modulation", () => {
      const result = parser.parse(
        "velocity: 20 * cos(1:0t) + 10 * noise()\ntiming: 0.03 * noise()\nprobability: 0.2 * cos(0:2t)",
      );
      expect(result).toHaveLength(3);
      expect(result[0].parameter).toBe("velocity");
      expect(result[1].parameter).toBe("timing");
      expect(result[2].parameter).toBe("probability");
    });
  });
});
