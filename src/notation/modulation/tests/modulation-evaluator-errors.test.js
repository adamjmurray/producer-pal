import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  applyModulations,
  evaluateModulation,
} from "#src/notation/modulation/modulation-evaluator.js";
import {
  evaluateExpression,
  evaluateModulationAST,
} from "#src/notation/modulation/modulation-evaluator-helpers.js";
import { evaluateFunction } from "#src/notation/modulation/modulation-functions.js";
import * as console from "#src/shared/v8-max-console.js";

describe("Modulation Evaluator Error Handling", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("applyModulations parsing errors", () => {
    it("handles invalid modulation string gracefully", () => {
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
      applyModulations(notes, "invalid @@ syntax", 4, 4);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse modulation string"),
      );
      // Notes should be unchanged
      expect(notes[0].velocity).toBe(100);
    });

    it("handles completely malformed modulation string", () => {
      const notes = [
        {
          start_time: 0,
          pitch: 60,
          velocity: 100,
          duration: 1,
          probability: 1,
        },
      ];

      applyModulations(notes, "{ this is not valid", 4, 4);

      expect(console.error).toHaveBeenCalled();
      expect(notes[0].velocity).toBe(100);
    });
  });

  describe("evaluateModulation parsing errors", () => {
    it("handles invalid modulation string gracefully", () => {
      const result = evaluateModulation("invalid @@ syntax", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse modulation string"),
      );
      expect(result).toStrictEqual({});
    });
  });

  describe("variable reference errors", () => {
    it("returns empty object when variable is not available", () => {
      // Try to reference a note variable that doesn't exist
      const result = evaluateModulation("velocity += note.nonexistent", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Should log error but return empty result for this parameter
      expect(console.error).toHaveBeenCalled();
      expect(result).toStrictEqual({});
    });

    it("evaluates successfully when variable is available", () => {
      const result = evaluateModulation(
        "velocity += note.pitch",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { pitch: 60 },
      );

      // Should work fine
      expect(result.velocity.value).toBe(60);
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("unknown waveform function errors", () => {
    it("handles unknown function gracefully", () => {
      const result = evaluateModulation("velocity += unknown_func(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(console.error).toHaveBeenCalled();
      expect(result).toStrictEqual({});
    });

    it("handles typo in waveform name", () => {
      const result = evaluateModulation("velocity += coss(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(console.error).toHaveBeenCalled();
      expect(result).toStrictEqual({});
    });
  });

  describe("function argument validation", () => {
    it("handles ramp without speed gracefully when speed is zero", () => {
      const result = evaluateModulation("velocity += ramp(0, 100, 0)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(console.error).toHaveBeenCalled();
      expect(result).toStrictEqual({});
    });

    it("handles waveform with zero period gracefully", () => {
      const result = evaluateModulation("velocity += cos(0)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(console.error).toHaveBeenCalled();
      expect(result).toStrictEqual({});
    });

    it("handles waveform with negative period gracefully", () => {
      const result = evaluateModulation("velocity += cos(-1)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(console.error).toHaveBeenCalled();
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
          { type: "unknown_type" },
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

  describe("direct evaluateModulationAST with unknown function", () => {
    it("handles unknown waveform function in AST", () => {
      const ast = [
        {
          parameter: "velocity",
          operator: "add",
          expression: {
            type: "function",
            name: "unknown_func",
            args: [{ type: "period", value: 1, unit: "t" }],
          },
        },
      ];

      const result = evaluateModulationAST(
        ast,
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
          clipTimeRange: { start: 0, end: 4 },
        },
        {},
      );

      expect(console.error).toHaveBeenCalled();
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
