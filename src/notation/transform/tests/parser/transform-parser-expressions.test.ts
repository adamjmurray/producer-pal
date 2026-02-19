// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type BinaryOpNode,
  type FunctionNode,
} from "#src/notation/transform/parser/transform-parser.ts";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - Expressions", () => {
  describe("function calls", () => {
    it("parses cos with frequency", () => {
      const result = parser.parse("velocity += cos(1t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "period", bars: 0, beats: 1 }],
        sync: false,
      });
    });

    it("parses cos with frequency and phase", () => {
      const result = parser.parse("velocity += cos(1t, 0.5)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "period", bars: 0, beats: 1 }, 0.5],
        sync: false,
      });
    });

    it("parses tri with frequency", () => {
      const result = parser.parse("velocity += tri(2t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "tri",
        args: [{ type: "period", bars: 0, beats: 2 }],
        sync: false,
      });
    });

    it("parses saw with frequency and phase", () => {
      const result = parser.parse("velocity += saw(0.5t, 0.25)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "saw",
        args: [{ type: "period", bars: 0, beats: 0.5 }, 0.25],
        sync: false,
      });
    });

    it("parses square with frequency", () => {
      const result = parser.parse("velocity += square(4t)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "period", bars: 0, beats: 4 }],
        sync: false,
      });
    });

    it("parses square with frequency and phase", () => {
      const result = parser.parse("velocity += square(1t, 0.25)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "period", bars: 0, beats: 1 }, 0.25],
        sync: false,
      });
    });

    it("parses square with frequency, phase, and pulseWidth", () => {
      const result = parser.parse("velocity += square(2t, 0, 0.75)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "period", bars: 0, beats: 2 }, 0, 0.75],
        sync: false,
      });
    });

    it("parses rand with no arguments", () => {
      const result = parser.parse("velocity += rand()");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "rand",
        args: [],
        sync: false,
      });
    });

    it("parses rand with one argument", () => {
      const result = parser.parse("velocity += rand(10)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "rand",
        args: [10],
        sync: false,
      });
    });

    it("parses rand with two arguments", () => {
      const result = parser.parse("velocity += rand(-5, 5)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "rand",
        args: [-5, 5],
        sync: false,
      });
    });

    it("parses choose with multiple arguments", () => {
      const result = parser.parse("velocity += choose(60, 80, 100)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "choose",
        args: [60, 80, 100],
        sync: false,
      });
    });

    it("parses curve with three arguments", () => {
      const result = parser.parse("velocity += curve(0, 127, 2)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "curve",
        args: [0, 127, 2],
        sync: false,
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
          sync: false,
        },
      });
    });

    it("parses multiple functions combined", () => {
      const result = parser.parse("velocity += 20 * cos(4:0t) + 10 * rand()");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: {
          type: "multiply",
          left: 20,
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "period", bars: 4, beats: 0 }],
            sync: false,
          },
        },
        right: {
          type: "multiply",
          left: 10,
          right: {
            type: "function",
            name: "rand",
            args: [],
            sync: false,
          },
        },
      });
    });

    it("parses unipolar envelope (offset + transform)", () => {
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
            sync: false,
          },
        },
      });
    });

    it("parses amplitude transform", () => {
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
            sync: false,
          },
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "period", bars: 0, beats: 1 }],
            sync: false,
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
            sync: false,
          },
          right: 1,
        },
      });
    });
  });

  describe("math functions", () => {
    it("parses round with single argument", () => {
      const result = parser.parse("velocity += round(10.7)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "round",
        args: [10.7],
        sync: false,
      });
    });

    it("parses floor with expression argument", () => {
      const result = parser.parse("velocity += floor(note.velocity / 10)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "floor",
        args: [
          {
            type: "divide",
            left: { type: "variable", namespace: "note", name: "velocity" },
            right: 10,
          },
        ],
        sync: false,
      });
    });

    it("parses abs with negative number", () => {
      const result = parser.parse("velocity += abs(-5)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "abs",
        args: [-5],
        sync: false,
      });
    });

    it("parses min with two arguments", () => {
      const result = parser.parse("velocity = min(127, note.velocity)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "min",
        args: [127, { type: "variable", namespace: "note", name: "velocity" }],
        sync: false,
      });
    });

    it("parses max with three arguments", () => {
      const result = parser.parse("velocity = max(60, note.velocity, 100)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "max",
        args: [
          60,
          { type: "variable", namespace: "note", name: "velocity" },
          100,
        ],
        sync: false,
      });
    });

    it("parses nested math functions", () => {
      const result = parser.parse("velocity = abs(floor(note.velocity / 2))");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "abs",
        args: [
          {
            type: "function",
            name: "floor",
            args: [
              {
                type: "divide",
                left: { type: "variable", namespace: "note", name: "velocity" },
                right: 2,
              },
            ],
            sync: false,
          },
        ],
        sync: false,
      });
    });
  });

  describe("sync keyword", () => {
    it("parses cos with frequency and sync", () => {
      const result = parser.parse("velocity += cos(1t, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "period", bars: 0, beats: 1 }],
        sync: true,
      });
    });

    it("parses tri with frequency, phase, and sync", () => {
      const result = parser.parse("velocity += tri(2t, 0.5, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "tri",
        args: [{ type: "period", bars: 0, beats: 2 }, 0.5],
        sync: true,
      });
    });

    it("parses square with all args and sync", () => {
      const result = parser.parse("velocity += square(2t, 0, 0.75, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "period", bars: 0, beats: 2 }, 0, 0.75],
        sync: true,
      });
    });

    it("parses saw with sync", () => {
      const result = parser.parse("velocity += saw(4:0t, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "saw",
        args: [{ type: "period", bars: 4, beats: 0 }],
        sync: true,
      });
    });

    it("rejects sync on rand", () => {
      expect(() => parser.parse("velocity += rand(sync)")).toThrow();
    });

    it("rejects sync on ramp", () => {
      expect(() => parser.parse("velocity += ramp(0, 1, sync)")).toThrow();
    });

    it("rejects sync on round", () => {
      expect(() => parser.parse("velocity += round(sync)")).toThrow();
    });

    it("rejects sync on choose", () => {
      expect(() => parser.parse("velocity += choose(1, 2, sync)")).toThrow();
    });
  });

  describe("modulo operator", () => {
    it("parses basic modulo", () => {
      const result = parser.parse("velocity += 10 % 3");

      expect(result[0]!.expression).toStrictEqual({
        type: "modulo",
        left: 10,
        right: 3,
      });
    });

    it("parses modulo with same precedence as multiply/divide", () => {
      const result = parser.parse("velocity += 10 + 5 % 3");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: 10,
        right: {
          type: "modulo",
          left: 5,
          right: 3,
        },
      });
    });

    it("parses chained modulo right-to-left", () => {
      const result = parser.parse("velocity += 10 % 7 % 3");

      expect(result[0]!.expression).toStrictEqual({
        type: "modulo",
        left: 10,
        right: {
          type: "modulo",
          left: 7,
          right: 3,
        },
      });
    });
  });

  describe("*= and /= operator desugar", () => {
    it("parses *= as set multiply on current note value", () => {
      const result = parser.parse("velocity *= 2");

      expect(result[0]!.operator).toBe("set");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("multiply");
      expect(expr.left).toStrictEqual({
        type: "variable",
        namespace: "note",
        name: "velocity",
      });
      expect(expr.right).toBe(2);
    });

    it("parses /= as set divide on current note value", () => {
      const result = parser.parse("duration /= 2");

      expect(result[0]!.operator).toBe("set");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("divide");
      expect(expr.left).toStrictEqual({
        type: "variable",
        namespace: "note",
        name: "duration",
      });
    });

    it("parses *= for gain using audio namespace, timing using note.start", () => {
      const gainExpr = (
        parser.parse("gain *= 0.5")[0]!.expression as BinaryOpNode
      ).left;
      const timingExpr = (
        parser.parse("timing *= 0.5")[0]!.expression as BinaryOpNode
      ).left;

      expect(gainExpr).toStrictEqual({
        type: "variable",
        namespace: "audio",
        name: "gain",
      });
      expect(timingExpr).toStrictEqual({
        type: "variable",
        namespace: "note",
        name: "start",
      });
    });

    it("parses *= with pitch range selector", () => {
      const result = parser.parse("F#1: velocity *= 0.5");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 42,
        endPitch: 42,
      });
      expect(result[0]!.operator).toBe("set");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("multiply");
      expect(expr.left).toStrictEqual({
        type: "variable",
        namespace: "note",
        name: "velocity",
      });
      expect(expr.right).toBe(0.5);
    });
  });
});
