import { describe, expect, it } from "vitest";
import {
  applyTransforms,
  evaluateTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import {
  evaluateExpression,
  evaluateTransformAST,
} from "#src/notation/transform/transform-evaluator-helpers.ts";
import type { TransformAssignment } from "#src/notation/transform/parser/transform-parser.ts";
import { evaluateFunction } from "#src/notation/transform/transform-functions.ts";

describe("Transform Evaluator Error Handling", () => {
  describe("applyTransforms parsing errors", () => {
    it("handles invalid transform string gracefully", () => {
      const notes = [
        {
          start_time: 0,
          pitch: 60,
          velocity: 100,
          duration: 1,
          probability: 1,
        },
      ];

      // Invalid syntax should trigger parse error
      applyTransforms(notes, "invalid @@ syntax", 4, 4);

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Failed to parse transform string"),
      );
      // Notes should be unchanged
      expect(notes[0]!.velocity).toBe(100);
    });

    it("handles completely malformed transform string", () => {
      const notes = [
        {
          start_time: 0,
          pitch: 60,
          velocity: 100,
          duration: 1,
          probability: 1,
        },
      ];

      applyTransforms(notes, "{ this is not valid", 4, 4);

      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
      expect(notes[0]!.velocity).toBe(100);
    });
  });

  describe("evaluateTransform parsing errors", () => {
    it("handles invalid transform string gracefully", () => {
      const result = evaluateTransform("invalid @@ syntax", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Failed to parse transform string"),
      );
      expect(result).toStrictEqual({});
    });
  });

  describe("variable reference errors", () => {
    it("returns empty object when variable is not available", () => {
      // Try to reference a note variable that doesn't exist
      const result = evaluateTransform("velocity += note.nonexistent", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Should log error but return empty result for this parameter
      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
      expect(result).toStrictEqual({});
    });

    it("evaluates successfully when variable is available", () => {
      const result = evaluateTransform(
        "velocity += note.pitch",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { pitch: 60 },
      );

      // Should work fine
      expect(result.velocity!.value).toBe(60);
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });
  });

  describe("unknown waveform function errors", () => {
    it("handles unknown function gracefully", () => {
      const result = evaluateTransform("velocity += unknown_func(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
      expect(result).toStrictEqual({});
    });

    it("handles typo in waveform name", () => {
      const result = evaluateTransform("velocity += coss(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
      expect(result).toStrictEqual({});
    });
  });

  describe("function argument validation", () => {
    it("handles ramp without speed gracefully when speed is zero", () => {
      const result = evaluateTransform("velocity += ramp(0, 100, 0)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
      expect(result).toStrictEqual({});
    });

    it("handles waveform with zero period gracefully", () => {
      const result = evaluateTransform("velocity += cos(0)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
      expect(result).toStrictEqual({});
    });

    it("handles waveform with negative period gracefully", () => {
      const result = evaluateTransform("velocity += cos(-1)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
      expect(result).toStrictEqual({});
    });
  });

  describe("direct evaluateExpression error paths", () => {
    it("throws error for missing variable in note properties", () => {
      expect(() => {
        evaluateExpression(
          { type: "variable", name: "missing" },
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
        { type: "variable", name: "pitch" },
        0,
        4,
        4,
        { start: 0, end: 4 },
        { pitch: 60 },
      );

      expect(result).toBe(60);
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
});
