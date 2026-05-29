// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type BinaryOpNode,
  type FunctionNode,
} from "#src/notation/transform/parser/transform-parser.ts";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - Expressions", () => {
  describe("function calls", () => {
    it("parses cos with period", () => {
      const result = parser.parse("velocity += cos(n/4)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "nDuration", wholeNoteFraction: 0.25 }],
        sync: false,
        raw: false,
      });
    });

    it("parses cos with period and phase", () => {
      const result = parser.parse("velocity += cos(n/4, 0.5)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "nDuration", wholeNoteFraction: 0.25 }, 0.5],
        sync: false,
        raw: false,
      });
    });

    it("parses tri with period", () => {
      const result = parser.parse("velocity += tri(n/2)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "tri",
        args: [{ type: "nDuration", wholeNoteFraction: 0.5 }],
        sync: false,
        raw: false,
      });
    });

    it("parses saw with period and phase", () => {
      const result = parser.parse("velocity += saw(n/8, 0.25)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "saw",
        args: [{ type: "nDuration", wholeNoteFraction: 0.125 }, 0.25],
        sync: false,
        raw: false,
      });
    });

    it("parses square with period", () => {
      const result = parser.parse("velocity += square(n/1)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "nDuration", wholeNoteFraction: 1 }],
        sync: false,
        raw: false,
      });
    });

    it("parses square with period and phase", () => {
      const result = parser.parse("velocity += square(n/4, 0.25)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "nDuration", wholeNoteFraction: 0.25 }, 0.25],
        sync: false,
        raw: false,
      });
    });

    it("parses square with period, phase, and pulseWidth", () => {
      const result = parser.parse("velocity += square(n/2, 0, 0.75)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "nDuration", wholeNoteFraction: 0.5 }, 0, 0.75],
        sync: false,
        raw: false,
      });
    });

    it("parses rand with no arguments", () => {
      const result = parser.parse("velocity += rand()");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "rand",
        args: [],
        sync: false,
        raw: false,
      });
    });

    it("parses rand with one argument", () => {
      const result = parser.parse("velocity += rand(10)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "rand",
        args: [10],
        sync: false,
        raw: false,
      });
    });

    it("parses rand with two arguments", () => {
      const result = parser.parse("velocity += rand(-5, 5)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "rand",
        args: [-5, 5],
        sync: false,
        raw: false,
      });
    });

    it("parses choose with multiple arguments", () => {
      const result = parser.parse("velocity += choose(60, 80, 100)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "choose",
        args: [60, 80, 100],
        sync: false,
        raw: false,
      });
    });

    it("parses curve with three arguments", () => {
      const result = parser.parse("velocity += curve(0, 127, 2)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "curve",
        args: [0, 127, 2],
        sync: false,
        raw: false,
      });
    });
  });

  describe("period parameters", () => {
    it("parses note-value period (n/4)", () => {
      const result = parser.parse("velocity += cos(n/4)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "nDuration",
        wholeNoteFraction: 0.25,
      });
    });

    it("parses note-value period with explicit numerator (n1/4)", () => {
      const result = parser.parse("velocity += cos(n1/4)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "nDuration",
        wholeNoteFraction: 0.25,
      });
    });

    it("parses eighth-note period (n/8)", () => {
      const result = parser.parse("velocity += cos(n/8)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "nDuration",
        wholeNoteFraction: 0.125,
      });
    });

    it("parses triplet period (n/12)", () => {
      const result = parser.parse("velocity += cos(n/12)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "nDuration",
        wholeNoteFraction: 1 / 12,
      });
    });

    it("parses dotted-quarter period (n3/8)", () => {
      const result = parser.parse("velocity += cos(n3/8)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "nDuration",
        wholeNoteFraction: 0.375,
      });
    });

    it("parses whole-note period (n/1)", () => {
      const result = parser.parse("velocity += cos(n/1)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "nDuration",
        wholeNoteFraction: 1,
      });
    });

    it("parses a numeric expression period (beats)", () => {
      const result = parser.parse("velocity += cos(2)");

      expect((result[0]!.expression as FunctionNode).args[0]).toBe(2);
    });

    it("parses a variable period (clip.barDuration)", () => {
      const result = parser.parse("velocity += cos(clip.barDuration)");

      expect((result[0]!.expression as FunctionNode).args[0]).toStrictEqual({
        type: "variable",
        namespace: "clip",
        name: "barDuration",
      });
    });

    it.each([
      "velocity += cos(1t)",
      "velocity += cos(0.5t)",
      "velocity += cos(1/3t)",
      "velocity += cos(1:0t)",
      "velocity += cos(4:0t)",
    ])("rejects removed period syntax: %s", (expr) => {
      expect(() => parser.parse(expr)).toThrow("no longer supported");
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
      const result = parser.parse("velocity += 20 * cos(n/1)");

      expect(result[0]!.expression).toStrictEqual({
        type: "multiply",
        left: 20,
        right: {
          type: "function",
          name: "cos",
          args: [{ type: "nDuration", wholeNoteFraction: 1 }],
          sync: false,
          raw: false,
        },
      });
    });

    it("parses multiple functions combined", () => {
      const result = parser.parse("velocity += 20 * cos(n4/1) + 10 * rand()");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: {
          type: "multiply",
          left: 20,
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "nDuration", wholeNoteFraction: 4 }],
            sync: false,
            raw: false,
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
            raw: false,
          },
        },
      });
    });

    it("parses unipolar envelope (offset + transform)", () => {
      const result = parser.parse("velocity += 20 + 20 * cos(n2/1)");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: 20,
        right: {
          type: "multiply",
          left: 20,
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "nDuration", wholeNoteFraction: 2 }],
            sync: false,
            raw: false,
          },
        },
      });
    });

    it("parses amplitude transform", () => {
      const result = parser.parse("velocity += 30 * cos(n4/1) * cos(n/4)");

      expect(result[0]!.expression).toStrictEqual({
        type: "multiply",
        left: 30,
        right: {
          type: "multiply",
          left: {
            type: "function",
            name: "cos",
            args: [{ type: "nDuration", wholeNoteFraction: 4 }],
            sync: false,
            raw: false,
          },
          right: {
            type: "function",
            name: "cos",
            args: [{ type: "nDuration", wholeNoteFraction: 0.25 }],
            sync: false,
            raw: false,
          },
        },
      });
    });

    it("parses swing timing with subtraction", () => {
      const result = parser.parse("timing += 0.05 * (cos(n/4) - 1)");

      expect(result[0]!.expression).toStrictEqual({
        type: "multiply",
        left: 0.05,
        right: {
          type: "subtract",
          left: {
            type: "function",
            name: "cos",
            args: [{ type: "nDuration", wholeNoteFraction: 0.25 }],
            sync: false,
            raw: false,
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
        raw: false,
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
        raw: false,
      });
    });

    it("parses abs with negative number", () => {
      const result = parser.parse("velocity += abs(-5)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "abs",
        args: [-5],
        sync: false,
        raw: false,
      });
    });

    it("parses min with two arguments", () => {
      const result = parser.parse("velocity = min(127, note.velocity)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "min",
        args: [127, { type: "variable", namespace: "note", name: "velocity" }],
        sync: false,
        raw: false,
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
        raw: false,
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
            raw: false,
          },
        ],
        sync: false,
        raw: false,
      });
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
    it.each([
      ["velocity *= 2", "multiply", "note", "velocity", 2],
      ["duration /= 2", "divide", "note", "duration", 2],
    ])(
      "parses %s as set %s on current value",
      (input, opType, namespace, name, right) => {
        const result = parser.parse(input);

        expect(result[0]!.operator).toBe("set");
        const expr = result[0]!.expression as BinaryOpNode;

        expect(expr.type).toBe(opType);
        expect(expr.left).toStrictEqual({ type: "variable", namespace, name });
        expect(expr.right).toBe(right);
      },
    );

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
