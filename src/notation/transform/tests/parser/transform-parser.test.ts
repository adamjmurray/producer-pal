// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type {
  BinaryOpNode,
  FunctionNode,
  VariableNode,
} from "#src/notation/transform/parser/transform-parser.ts";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser", () => {
  describe("basic structure", () => {
    it("parses an empty input", () => {
      expect(parser.parse("")).toStrictEqual([]);
      expect(parser.parse("  \t ")).toStrictEqual([]);
    });
    it("parses single parameter assignment with += operator", () => {
      const result = parser.parse("velocity += 10");

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "add",
          expression: 10,
        },
      ]);
    });
    it("parses single parameter assignment with = operator", () => {
      const result = parser.parse("velocity = 10");

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "set",
          expression: 10,
        },
      ]);
    });
    it("parses multiple parameter assignments", () => {
      const result = parser.parse("velocity += 10\ntiming += 0.05");

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "add",
          expression: 10,
        },
        {
          pitchRange: null,
          timeRange: null,
          parameter: "timing",
          operator: "add",
          expression: 0.05,
        },
      ]);
    });

    it("parses all parameter types", () => {
      const result = parser.parse(
        "velocity += 1\ntiming += 2\nduration += 3\nprobability += 4\ndeviation += 5\npitch += 6",
      );

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "add",
          expression: 1,
        },
        {
          pitchRange: null,
          timeRange: null,
          parameter: "timing",
          operator: "add",
          expression: 2,
        },
        {
          pitchRange: null,
          timeRange: null,
          parameter: "duration",
          operator: "add",
          expression: 3,
        },
        {
          pitchRange: null,
          timeRange: null,
          parameter: "probability",
          operator: "add",
          expression: 4,
        },
        {
          pitchRange: null,
          timeRange: null,
          parameter: "deviation",
          operator: "add",
          expression: 5,
        },
        {
          pitchRange: null,
          timeRange: null,
          parameter: "pitch",
          operator: "add",
          expression: 6,
        },
      ]);
    });
  });

  describe("pitch selectors", () => {
    it("parses single note name as pitch range", () => {
      const result = parser.parse("C1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 36,
        endPitch: 36,
      }); // C1 = MIDI 36
    });

    it("parses sharp notes", () => {
      const result = parser.parse("C#1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 37,
        endPitch: 37,
      });
    });

    it("parses flat notes", () => {
      const result = parser.parse("Db1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 37,
        endPitch: 37,
      });
    });

    it("parses pitch range with hyphen", () => {
      const result = parser.parse("C3-C5: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 60, // C3 = MIDI 60
        endPitch: 84, // C5 = MIDI 84
      });
    });

    it("parses pitch range with different note names", () => {
      const result = parser.parse("C4-G4: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 72, // C4 = MIDI 72
        endPitch: 79, // G4 = MIDI 79
      });
    });

    it("parses pitch range with sharps and flats", () => {
      const result = parser.parse("C#3-Eb4: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 61, // C#3 = MIDI 61
        endPitch: 75, // Eb4 = MIDI 75
      });
    });

    it("throws on invalid pitch range (end < start)", () => {
      expect(() => parser.parse("C5-C3: velocity += 10")).toThrow(
        /Invalid pitch range/,
      );
    });

    it("throws on invalid pitch (out of range)", () => {
      expect(() => parser.parse("C10: velocity += 10")).toThrow();
      expect(() => parser.parse("C-5: velocity += 10")).toThrow();
    });
  });

  describe("time range selectors", () => {
    it("parses bar|beat-bar|beat range", () => {
      const result = parser.parse("1|1-3|1: velocity += 10");

      expect(result[0]!.timeRange).toStrictEqual({
        startBar: 1,
        startBeat: 1,
        endBar: 3,
        endBeat: 1,
      });
    });

    it("parses fractional beats in range", () => {
      const result = parser.parse("1|1.5-2|3.5: velocity += 10");

      expect(result[0]!.timeRange).toStrictEqual({
        startBar: 1,
        startBeat: 1.5,
        endBar: 2,
        endBeat: 3.5,
      });
    });

    it("parses range with mixed numbers", () => {
      const result = parser.parse("1|1+1/2-2|1+3/4: velocity += 10");

      expect(result[0]!.timeRange!.startBeat).toBeCloseTo(1.5);
      expect(result[0]!.timeRange!.endBeat).toBeCloseTo(1.75);
    });
  });

  describe("combined selectors", () => {
    it("parses pitch with time range", () => {
      const result = parser.parse("E3 1|1-2|1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 64,
        endPitch: 64,
      }); // E3 = MIDI 64
      expect(result[0]!.timeRange).toStrictEqual({
        startBar: 1,
        startBeat: 1,
        endBar: 2,
        endBeat: 1,
      });
    });

    it("parses note name with time range", () => {
      const result = parser.parse("C1 1|1-4|1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 36,
        endPitch: 36,
      });
      expect(result[0]!.timeRange!.startBar).toBe(1);
    });

    it("parses pitch range with time range", () => {
      const result = parser.parse("C3-C5 1|1-2|1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 60,
        endPitch: 84,
      });
      expect(result[0]!.timeRange).toStrictEqual({
        startBar: 1,
        startBeat: 1,
        endBar: 2,
        endBeat: 1,
      });
    });

    it("parses time range before pitch range", () => {
      const result = parser.parse("1|1-2|1 E3: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 64,
        endPitch: 64,
      });
      expect(result[0]!.timeRange).toStrictEqual({
        startBar: 1,
        startBeat: 1,
        endBar: 2,
        endBeat: 1,
      });
    });

    it("parses time range before pitch range (with range)", () => {
      const result = parser.parse("1|1-2|1 C3-C5: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 60,
        endPitch: 84,
      });
      expect(result[0]!.timeRange).toStrictEqual({
        startBar: 1,
        startBeat: 1,
        endBar: 2,
        endBeat: 1,
      });
    });
  });

  describe("operators", () => {
    it("parses = operator", () => {
      const result = parser.parse("velocity = 64");

      expect(result[0]!.operator).toBe("set");
    });

    it("parses += operator", () => {
      const result = parser.parse("velocity += 10");

      expect(result[0]!.operator).toBe("add");
    });

    it("rejects old : operator", () => {
      expect(() => parser.parse("velocity: 10")).toThrow();
    });
  });

  describe("numbers", () => {
    it("parses positive integers", () => {
      const result = parser.parse("velocity += 100");

      expect(result[0]!.expression).toBe(100);
    });

    it("parses negative integers", () => {
      const result = parser.parse("velocity += -50");

      expect(result[0]!.expression).toBe(-50);
    });

    it("parses positive floats", () => {
      const result = parser.parse("velocity += 10.5");

      expect(result[0]!.expression).toBe(10.5);
    });

    it("parses negative floats", () => {
      const result = parser.parse("timing += -0.05");

      expect(result[0]!.expression).toBe(-0.05);
    });

    it("parses floats without leading zero", () => {
      const result = parser.parse("probability += .5");

      expect(result[0]!.expression).toBe(0.5);
    });
  });

  describe("whitespace and comments", () => {
    it("handles whitespace around operators", () => {
      const result = parser.parse("velocity +=   10   +   5");

      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: 10,
        right: 5,
      });
    });

    it("handles multiple blank lines between assignments", () => {
      const result = parser.parse("velocity += 10\n\n\ntiming += 0.05");

      expect(result).toHaveLength(2);
      expect(result[0]!.parameter).toBe("velocity");
      expect(result[1]!.parameter).toBe("timing");
    });

    it("handles line comments", () => {
      const result = parser.parse("velocity += 10 // this is a comment");

      expect(result[0]!.expression).toBe(10);
    });

    it("handles hash comments", () => {
      const result = parser.parse("velocity += 10 # this is a comment");

      expect(result[0]!.expression).toBe(10);
    });

    it("handles block comments", () => {
      const result = parser.parse("velocity += 10 /* block comment */");

      expect(result[0]!.expression).toBe(10);
    });

    it("handles comments on separate lines", () => {
      const result = parser.parse(
        "// comment\nvelocity += 10\n// another comment\ntiming += 0.05",
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.parameter).toBe("velocity");
      expect(result[1]!.parameter).toBe("timing");
    });
  });

  describe("error cases", () => {
    it("throws on invalid parameter name", () => {
      expect(() => parser.parse("invalid += 10")).toThrow();
    });

    it("throws on missing expression", () => {
      expect(() => parser.parse("velocity +=")).toThrow();
    });

    it("throws on invalid function name", () => {
      expect(() => parser.parse("velocity += invalid(1t)")).toThrow();
    });

    it("accepts plain number as function argument", () => {
      // Plain numbers are valid (e.g., for phase or pulseWidth)
      const result = parser.parse("velocity += cos(1t, 0.5)");
      const expr = result[0]!.expression as FunctionNode;

      expect(expr.args[1]).toBe(0.5);
    });

    it("throws on unclosed parenthesis", () => {
      expect(() => parser.parse("velocity += (10 + 5")).toThrow();
    });

    it("throws on unmatched closing parenthesis", () => {
      expect(() => parser.parse("velocity += 10 + 5)")).toThrow();
    });
  });

  describe("real-world examples from spec", () => {
    it("parses basic envelope", () => {
      const result = parser.parse("velocity += 20 * cos(1:0t)");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(result[0]!.parameter).toBe("velocity");
      expect(expr.type).toBe("multiply");
    });

    it("parses phase-shifted envelope", () => {
      const result = parser.parse("velocity += 20 * cos(1:0t, 0.5)");
      const expr = result[0]!.expression as BinaryOpNode;
      const fn = expr.right as FunctionNode;

      expect(fn.args).toHaveLength(2);
      expect(fn.args[1]).toBe(0.5);
    });

    it("parses pulse width transform", () => {
      const result = parser.parse("velocity += 20 * square(2t, 0, 0.25)");
      const expr = result[0]!.expression as BinaryOpNode;
      const fn = expr.right as FunctionNode;

      expect(fn.name).toBe("square");
      expect(fn.args).toHaveLength(3);
      expect(fn.args[2]).toBe(0.25);
    });

    it("parses multi-parameter transform", () => {
      const result = parser.parse(
        "velocity += 20 * cos(1:0t) + 10 * noise()\ntiming += 0.03 * noise()\nprobability += 0.2 * cos(0:2t)",
      );

      expect(result).toHaveLength(3);
      expect(result[0]!.parameter).toBe("velocity");
      expect(result[1]!.parameter).toBe("timing");
      expect(result[2]!.parameter).toBe("probability");
    });
  });

  describe("gain parameter (audio)", () => {
    it("parses gain parameter with set operator", () => {
      const result = parser.parse("gain = -6");

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "gain",
          operator: "set",
          expression: -6,
        },
      ]);
    });

    it("parses gain parameter with add operator", () => {
      const result = parser.parse("gain += 3");

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "gain",
          operator: "add",
          expression: 3,
        },
      ]);
    });

    it("parses gain with expression", () => {
      const result = parser.parse("gain = -12 + 6");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("add");
      expect(expr.left).toBe(-12);
      expect(expr.right).toBe(6);
    });
  });

  describe("variable namespaces", () => {
    it("parses note.velocity with namespace", () => {
      const result = parser.parse("velocity = note.velocity + 10");
      const expr = result[0]!.expression as BinaryOpNode;
      const variable = expr.left as VariableNode;

      expect(variable).toStrictEqual({
        type: "variable",
        namespace: "note",
        name: "velocity",
      });
    });

    it("parses audio.gain with namespace", () => {
      const result = parser.parse("gain = audio.gain - 6");
      const expr = result[0]!.expression as BinaryOpNode;
      const variable = expr.left as VariableNode;

      expect(variable).toStrictEqual({
        type: "variable",
        namespace: "audio",
        name: "gain",
      });
    });

    it("parses all note properties with namespace", () => {
      const properties = [
        "velocity",
        "pitch",
        "deviation",
        "probability",
        "duration",
        "start",
      ];

      for (const prop of properties) {
        const result = parser.parse(`velocity = note.${prop}`);
        const variable = result[0]!.expression as VariableNode;

        expect(variable.namespace).toBe("note");
        expect(variable.name).toBe(prop);
      }
    });

    it("rejects invalid audio property", () => {
      expect(() => parser.parse("gain = audio.velocity")).toThrow();
    });

    it("rejects invalid note property", () => {
      expect(() => parser.parse("velocity = note.gain")).toThrow();
    });
  });

  describe("pitch parameter", () => {
    it("parses pitch parameter with set operator", () => {
      const result = parser.parse("pitch = 60");

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "pitch",
          operator: "set",
          expression: 60,
        },
      ]);
    });

    it("parses pitch parameter with add operator", () => {
      const result = parser.parse("pitch += 12");

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "pitch",
          operator: "add",
          expression: 12,
        },
      ]);
    });

    it("parses negative pitch offset", () => {
      const result = parser.parse("pitch += -12");

      expect(result[0]!.expression).toBe(-12);
    });

    it("parses pitch with pitch range filter", () => {
      const result = parser.parse("C3: pitch += 12");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 60,
        endPitch: 60,
      });
      expect(result[0]!.parameter).toBe("pitch");
    });

    it("parses pitch with time range filter", () => {
      const result = parser.parse("1|1-2|4: pitch += 12");

      expect(result[0]!.timeRange).toStrictEqual({
        startBar: 1,
        startBeat: 1,
        endBar: 2,
        endBeat: 4,
      });
      expect(result[0]!.parameter).toBe("pitch");
    });
  });

  describe("pitch literals in expressions", () => {
    it("parses pitch literal C3 (middle C)", () => {
      const result = parser.parse("pitch = C3");

      expect(result[0]!.expression).toBe(60);
    });

    it("parses pitch literal with sharp", () => {
      const result = parser.parse("pitch = C#3");

      expect(result[0]!.expression).toBe(61);
    });

    it("parses pitch literal with flat", () => {
      const result = parser.parse("pitch = Db3");

      expect(result[0]!.expression).toBe(61);
    });

    it("parses pitch literal in arithmetic expression", () => {
      const result = parser.parse("pitch = C3 + 7");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("add");
      expect(expr.left).toBe(60);
      expect(expr.right).toBe(7);
    });

    it("parses pitch literal with negative octave", () => {
      const result = parser.parse("pitch = C-1");

      expect(result[0]!.expression).toBe(12);
    });

    it("parses lowest valid pitch literal C-2", () => {
      const result = parser.parse("pitch = C-2");

      expect(result[0]!.expression).toBe(0);
    });

    it("parses highest valid pitch literal G8", () => {
      const result = parser.parse("pitch = G8");

      expect(result[0]!.expression).toBe(127);
    });

    it("throws on pitch literal out of range (too high)", () => {
      expect(() => parser.parse("pitch = C9")).toThrow(/outside valid range/);
    });

    it("throws on pitch literal out of range (too low)", () => {
      expect(() => parser.parse("pitch = C-3")).toThrow(/outside valid range/);
    });

    it("parses pitch literal in complex expression", () => {
      const result = parser.parse("pitch = (C3 + G3) / 2");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("divide");
      expect((expr.left as BinaryOpNode).type).toBe("add");
      expect((expr.left as BinaryOpNode).left).toBe(60);
      expect((expr.left as BinaryOpNode).right).toBe(67);
      expect(expr.right).toBe(2);
    });

    it("parses pitch literal with note variable", () => {
      const result = parser.parse("pitch = C3 + note.pitch");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("add");
      expect(expr.left).toBe(60);
      expect((expr.right as VariableNode).name).toBe("pitch");
    });
  });
});
