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
} from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { type TransformAssignment } from "#src/notation/transform/parser/transform-parser.ts";
import { evaluateMathFunction } from "#src/notation/transform/helpers/transform-functions-helpers.ts";
import { evaluateFunction } from "#src/notation/transform/transform-functions.ts";
import {
  createTestNote,
  createTestNotes,
  DEFAULT_CONTEXT,
  expectTransformError,
} from "./transform-evaluator-test-helpers.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";

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

      expect(() => applyTransforms(notes, "{ this is not valid", 4, 4)).toThrow(
        'but "{" found',
      );
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
      expect(capturedWarnings()).toHaveLength(0);
    });
  });

  describe("unknown waveform function errors", () => {
    // The message names the function list on purpose: a model that guessed a
    // name reads this and retries, instead of abandoning the DSL.
    it("names the unknown function and lists the real ones", () => {
      expect(() =>
        evaluateTransform("velocity += unknown_func(1)", DEFAULT_CONTEXT),
      ).toThrow(/unknown function unknown_func\(\) — available: abs, /);
    });

    it("catches a typo in a waveform name", () => {
      expect(() =>
        evaluateTransform("velocity += coss(1)", DEFAULT_CONTEXT),
      ).toThrow(/unknown function coss\(\).*\bcos\b/);
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
            args: [1],
            sync: false,
            raw: false,
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

      expect(capturedWarnings()).not.toHaveLength(0);
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

    // The grammar's swingArgumentList only accepts 1-2 arguments, so these
    // counts can only arrive from a hand-built AST — the guard is the contract
    // for direct callers.
    it.each([
      [[], "no arguments"],
      [[1, 2, 3], "three arguments"],
    ])("rejects swing() with %s", (args) => {
      expect(() => {
        evaluateFunction(
          "swing",
          args,
          false,
          false,
          0,
          4,
          4,
          { start: 0, end: 4 },
          {},
          evaluateExpression,
        );
      }).toThrow("Function swing() requires 1-2 arguments");
    });

    // evaluateFunction gates the math dispatch to the seven known names, so an
    // unhandled name only reaches the switch through a direct call.
    it("rejects an unknown math function name", () => {
      expect(() => {
        evaluateMathFunction(
          "sqrt",
          [1],
          0,
          4,
          4,
          { start: 0, end: 4 },
          {},
          evaluateExpression,
        );
      }).toThrow("Unknown math function: sqrt()");
    });
  });

  describe("audio parameters in MIDI context", () => {
    it("warns and skips audio parameters when applied to MIDI notes", () => {
      const notes = createTestNote();

      applyTransforms(notes, "gain = 0.5", 4, 4);

      expect(notes[0]!.velocity).toBe(100); // unchanged
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("Audio parameters"),
      );
    });
  });

  describe("function argument validation - empty args and invalid params", () => {
    it("handles choose with no arguments", () => {
      expectTransformError("velocity = choose()");
    });

    it("handles seq with no arguments", () => {
      expectTransformError("velocity = seq()");
    });

    it("handles curve with non-positive exponent", () => {
      expectTransformError("velocity = curve(0, 100, 0)");
    });
  });

  describe("math function error handling", () => {
    it.each([
      ["round()", "round with no arguments"],
      ["floor()", "floor with no arguments"],
      ["abs()", "abs with no arguments"],
      ["ceil()", "ceil with no arguments"],
      ["round(1.5, 99)", "round with an extra argument"],
      ["floor(1.5, 2)", "floor with an extra argument"],
      ["abs(-1, 2)", "abs with an extra argument"],
      ["ceil(1.5, 2)", "ceil with an extra argument"],
      ["pow(2)", "pow with only one argument"],
      ["pow(0, -1)", "pow producing Infinity"],
      ["pow(-1, 0.5)", "pow producing NaN"],
      ["min(60)", "min with only one argument"],
      ["max(60)", "max with only one argument"],
      ["clamp(50)", "clamp with only one argument"],
      ["clamp(50, 0)", "clamp with only two arguments"],
      ["clamp(50, 0, 100, 200)", "clamp with four arguments"],
      ["wrap(50)", "wrap with only one argument"],
      ["wrap(50, 0)", "wrap with only two arguments"],
      ["wrap(50, 0, 100, 200)", "wrap with four arguments"],
      ["reflect(50)", "reflect with only one argument"],
      ["reflect(50, 0)", "reflect with only two arguments"],
      ["reflect(50, 0, 100, 200)", "reflect with four arguments"],
    ])("handles %s error", (expr) => {
      expectTransformError(`velocity = ${expr}`);
    });
  });

  describe("waveform argument validation", () => {
    // sin/cos/tri/saw take period + optional phase (sync is a trailing keyword,
    // not an arg); square also takes an optional pulseWidth. A further positional
    // arg is now rejected rather than silently dropped.
    it.each([
      ["cos(n/4, 0, 0.9)", "cos with a 3rd positional argument"],
      ["sin(n/4, 0, 0.9)", "sin with a 3rd positional argument"],
      ["tri(n/4, 0, 0.9)", "tri with a 3rd positional argument"],
      ["saw(n/4, 0, 0.9)", "saw with a 3rd positional argument"],
      ["square(n/4, 0, 0.5, 0.9)", "square with a 4th positional argument"],
    ])("handles %s error", (expr) => {
      expectTransformError(`velocity = ${expr}`);
    });
  });

  describe("malformed-line warning deduplication", () => {
    it("relays one warning per malformed line, not one per note", () => {
      clearCapturedWarnings();

      const notes = createTestNotes([
        { start_time: 0 },
        { start_time: 1 },
        { start_time: 2 },
        { start_time: 3 },
      ]);

      // round() rejects the extra arg for every selected note; the failure is
      // note-invariant, so it must surface exactly once.
      applyTransforms(notes, "velocity = round(1, 2)", 4, 4);

      const failureWarnings = capturedWarnings().filter((warning) =>
        warning.includes("Failed to evaluate transform"),
      );

      expect(failureWarnings).toHaveLength(1);
      // The whole assignment is skipped, so velocities are untouched.
      expect(notes.every((note) => note.velocity === 100)).toBe(true);
    });
  });
});
