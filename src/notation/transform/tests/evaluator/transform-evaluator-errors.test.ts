// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  applyTransforms,
  evaluateTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import {
  evaluateExpression,
  evaluateTransformAST,
} from "#src/notation/transform/transform-evaluator-helpers.ts";
import { type TransformAssignment } from "#src/notation/transform/parser/transform-parser.ts";
import { evaluateFunction } from "#src/notation/transform/transform-functions.ts";
import {
  createTestNote,
  DEFAULT_CONTEXT,
  expectTransformError,
} from "./transform-evaluator-test-helpers.ts";

describe("Transform Evaluator Error Handling", () => {
  describe("applyTransforms parsing errors", () => {
    it("throws on invalid transform string", () => {
      const notes = createTestNote();

      expect(() => applyTransforms(notes, "invalid @@ syntax", 4, 4)).toThrow(
        /transform syntax error/,
      );
      // Notes should be unchanged (throw happened before any modification)
      expect(notes[0]!.velocity).toBe(100);
    });

    it("throws on completely malformed transform string", () => {
      const notes = createTestNote();

      expect(() =>
        applyTransforms(notes, "{ this is not valid", 4, 4),
      ).toThrow();
    });
  });

  describe("evaluateTransform parsing errors", () => {
    it("throws on invalid transform string", () => {
      expect(() =>
        evaluateTransform("invalid @@ syntax", DEFAULT_CONTEXT),
      ).toThrow(/transform syntax error/);
    });
  });

  describe("variable reference errors", () => {
    it("throws on invalid note property name", () => {
      // note.nonexistent is a parse error (not in grammar's allowed names)
      expect(() =>
        evaluateTransform("velocity += note.nonexistent", DEFAULT_CONTEXT),
      ).toThrow(/transform syntax error/);
    });

    it("evaluates successfully when variable is available", () => {
      const result = evaluateTransform(
        "velocity += note.pitch",
        DEFAULT_CONTEXT,
        { pitch: 60 },
      );

      // Should work fine
      expect(result.velocity!.value).toBe(60);
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });
  });

  describe("unknown waveform function errors", () => {
    it("throws on unknown function name", () => {
      // unknown_func is a parse error (not in grammar's function name lists)
      expect(() =>
        evaluateTransform("velocity += unknown_func(1t)", DEFAULT_CONTEXT),
      ).toThrow(/transform syntax error/);
    });

    it("throws on typo in waveform name", () => {
      // coss is a parse error (not in grammar's function name lists)
      expect(() =>
        evaluateTransform("velocity += coss(1t)", DEFAULT_CONTEXT),
      ).toThrow(/transform syntax error/);
    });
  });

  describe("function argument validation", () => {
    it("handles rand with too many arguments", () => {
      expectTransformError("velocity = rand(0, 100, 50)");
    });

    it("handles ramp with too few arguments", () => {
      expectTransformError("velocity = ramp(100)");
    });

    it("handles ramp with too many arguments", () => {
      expectTransformError("velocity = ramp(0, 100, 1)");
    });

    it("handles waveform with zero period gracefully", () => {
      expectTransformError("velocity += cos(0)");
    });

    it("handles waveform with negative period gracefully", () => {
      expectTransformError("velocity += cos(-1)");
    });
  });

  describe("direct evaluateExpression error paths", () => {
    it("throws error for missing variable in note properties", () => {
      expect(() => {
        evaluateExpression(
          { type: "variable", namespace: "note", name: "missing" },
          0,
          4,
          4,
          { start: 0, end: 4 },
          {},
        );
      }).toThrow('Variable "note.missing" is not available in this context');
    });

    it("throws error for unknown expression node type", () => {
      expect(() => {
        evaluateExpression(
          { type: "unknown_type" } as unknown as Parameters<
            typeof evaluateExpression
          >[0],
          0,
          4,
          4,
          { start: 0, end: 4 },
          {},
        );
      }).toThrow("Unknown expression node type: unknown_type");
    });

    it("works correctly with valid variable reference", () => {
      const result = evaluateExpression(
        { type: "variable", namespace: "note", name: "pitch" },
        0,
        4,
        4,
        { start: 0, end: 4 },
        { pitch: 60 },
      );

      expect(result).toBe(60);
    });

    it("throws error for audio variable in MIDI context", () => {
      expect(() => {
        evaluateExpression(
          { type: "variable", namespace: "audio", name: "gain" },
          0,
          4,
          4,
          { start: 0, end: 4 },
          {},
        );
      }).toThrow("Cannot use audio.gain variable in MIDI note context");
    });
  });

  describe("direct evaluateTransformAST with unknown function", () => {
    it("handles unknown waveform function in AST", () => {
      const ast = [
        {
          parameter: "velocity" as const,
          operator: "add" as const,
          pitchRange: null,
          timeRange: null,
          expression: {
            type: "function" as const,
            name: "unknown_func",
            args: [{ type: "period" as const, bars: 0, beats: 1 }],
            sync: false,
          },
        },
      ];

      const result = evaluateTransformAST(
        ast as unknown as TransformAssignment[],
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
          clipTimeRange: { start: 0, end: 4 },
        },
        {},
      );

      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
      expect(result).toStrictEqual({});
    });
  });

  describe("direct evaluateFunction error paths", () => {
    it("throws error for unknown waveform function", () => {
      expect(() => {
        evaluateFunction(
          "unknown_waveform",
          [1], // Simple number period in beats
          false,
          0,
          4,
          4,
          { start: 0, end: 4 },
          {},
          evaluateExpression,
        );
      }).toThrow("Unknown waveform function: unknown_waveform()");
    });

    it("works correctly with known waveform function", () => {
      const result = evaluateFunction(
        "cos",
        [1], // Simple number period in beats
        false,
        0,
        4,
        4,
        { start: 0, end: 4 },
        {},
        evaluateExpression,
      );

      expect(typeof result).toBe("number");
    });
  });

  describe("math function error handling", () => {
    it.each([
      ["round()", "round with no arguments"],
      ["floor()", "floor with no arguments"],
      ["abs()", "abs with no arguments"],
      ["ceil()", "ceil with no arguments"],
      ["pow(2)", "pow with only one argument"],
      ["pow(0, -1)", "pow producing Infinity"],
      ["pow(-1, 0.5)", "pow producing NaN"],
      ["min(60)", "min with only one argument"],
      ["max(60)", "max with only one argument"],
      ["clamp(50)", "clamp with only one argument"],
      ["clamp(50, 0)", "clamp with only two arguments"],
      ["clamp(50, 0, 100, 200)", "clamp with four arguments"],
    ])("handles %s error", (expr) => {
      expectTransformError(`velocity = ${expr}`);
    });
  });
});
