// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  applyTransforms,
  evaluateTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import {
  evaluateExpression,
  evaluateTransformAST,
} from "#src/notation/transform/helpers/transform-evaluation.ts";
import { type TransformAssignment } from "#src/notation/transform/parser/transform-parser.ts";
import { evaluateMathFunction } from "#src/notation/transform/helpers/functions/shape-functions.ts";
import { evaluateFunction } from "#src/notation/transform/transform-functions.ts";
import {
  createEvalContext,
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
        'position 0 (line 1, column 1) near "{ this is not valid"',
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

  describe("function arguments", () => {
    it("takes a zero period as phase 0 rather than erroring", () => {
      expect(
        evaluateTransform("velocity += cos(0)", DEFAULT_CONTEXT).velocity!
          .value,
      ).toBe(1);
    });

    it("takes a negative period rather than erroring", () => {
      expect(
        evaluateTransform("velocity += cos(0 - 1)", DEFAULT_CONTEXT).velocity!
          .value,
      ).toBe(1);
    });
  });

  describe("direct evaluateExpression error paths", () => {
    it("throws error for missing variable in note properties", () => {
      expect(() => {
        evaluateExpression(
          { type: "variable", namespace: "note", name: "missing" },
          createEvalContext(),
        );
      }).toThrow('Variable "note.missing" is not available in this context');
    });

    it("throws error for unknown expression node type", () => {
      expect(() => {
        evaluateExpression(
          { type: "unknown_type" } as unknown as Parameters<
            typeof evaluateExpression
          >[0],
          createEvalContext(),
        );
      }).toThrow("Unknown expression node type: unknown_type");
    });

    it("works correctly with valid variable reference", () => {
      const result = evaluateExpression(
        { type: "variable", namespace: "note", name: "pitch" },
        createEvalContext({ noteProperties: { pitch: 60 } }),
      );

      expect(result).toBe(60);
    });

    it("throws error for audio variable in MIDI context", () => {
      expect(() => {
        evaluateExpression(
          { type: "variable", namespace: "audio", name: "gain" },
          createEvalContext(),
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
          createEvalContext(),
        );
      }).toThrow("Unknown waveform function: unknown_waveform()");
    });

    it("works correctly with known waveform function", () => {
      const result = evaluateFunction(
        "cos",
        [1], // Simple number period in beats
        false,
        false,
        createEvalContext(),
      );

      expect(typeof result).toBe("number");
    });

    // evaluateFunction gates the math dispatch to the seven known names, so an
    // unhandled name only reaches the switch through a direct call.
    it("rejects an unknown math function name", () => {
      expect(() => {
        evaluateMathFunction("sqrt", [1], createEvalContext());
      }).toThrow("Unknown math function: sqrt()");
    });
  });

  describe("audio parameters in MIDI context", () => {
    it("warns and skips audio parameters when applied to MIDI notes", () => {
      const notes = createTestNote();

      applyTransforms(notes, "gain = 0.5", 4, 4);

      expect(notes[0]!.velocity).toBe(100); // unchanged
      expect(capturedWarnings()).toContainEqual(
        "gain ignored: the clip is MIDI",
      );
    });
  });

  describe("function evaluation errors", () => {
    it("handles curve with a non-positive exponent only known as it runs", () => {
      // cos() is judged per note, so the exponent isn't refused up front
      expectTransformError("velocity = curve(0, 100, cos(n/4) - 2)");
    });
  });

  describe("math function evaluation errors", () => {
    it.each([
      ["pow(0, -1)", "pow producing Infinity"],
      ["pow(-1, 0.5)", "pow producing NaN"],
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

      // audio.gain can't be read in a MIDI note context, for every selected
      // note; the failure is note-invariant, so it must surface exactly once.
      applyTransforms(notes, "velocity = audio.gain", 4, 4);

      const failureWarnings = capturedWarnings().filter((warning) =>
        warning.includes(" transform failed"),
      );

      expect(failureWarnings).toHaveLength(1);
      // The whole assignment is skipped, so velocities are untouched.
      expect(notes.every((note) => note.velocity === 100)).toBe(true);
    });
  });
});
