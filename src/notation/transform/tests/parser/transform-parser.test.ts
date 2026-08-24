// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type BinaryOpNode,
  type FunctionNode,
  type PitchLiteralNode,
  type VariableNode,
} from "#src/notation/transform/parser/transform-parser.ts";
import { parseAssignments } from "./parse-test-helpers.ts";

describe("Transform Parser", () => {
  describe("basic structure", () => {
    it("parses an empty input", () => {
      expect(parseAssignments("")).toStrictEqual([]);
      expect(parseAssignments("  \t ")).toStrictEqual([]);
    });
    it("parses single parameter assignment with += operator", () => {
      const result = parseAssignments("velocity += 10");

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
      const result = parseAssignments("velocity = 10");

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
      const result = parseAssignments("velocity += 10\ntiming += 0.05");

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
      const result = parseAssignments(
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
      const result = parseAssignments("C1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 36,
        endPitch: 36,
      }); // C1 = MIDI 36
    });

    it("parses sharp notes", () => {
      const result = parseAssignments("C#1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 37,
        endPitch: 37,
      });
    });

    it("parses flat notes", () => {
      const result = parseAssignments("Db1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 37,
        endPitch: 37,
      });
    });

    it("parses pitch range with hyphen", () => {
      const result = parseAssignments("C3-C5: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 60, // C3 = MIDI 60
        endPitch: 84, // C5 = MIDI 84
      });
    });

    it("parses pitch range with different note names", () => {
      const result = parseAssignments("C4-G4: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 72, // C4 = MIDI 72
        endPitch: 79, // G4 = MIDI 79
      });
    });

    it("parses pitch range with sharps and flats", () => {
      const result = parseAssignments("C#3-Eb4: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 61, // C#3 = MIDI 61
        endPitch: 75, // Eb4 = MIDI 75
      });
    });

    it("throws on invalid pitch range (end < start)", () => {
      expect(() => parseAssignments("C5-C3: velocity += 10")).toThrow(
        /Invalid pitch range/,
      );
    });

    it("throws on invalid pitch (out of range)", () => {
      expect(() => parseAssignments("C10: velocity += 10")).toThrow(
        "MIDI pitch 144 (C10) outside valid range 0-127",
      );
      expect(() => parseAssignments("C-5: velocity += 10")).toThrow(
        "MIDI pitch -36 (C-5) outside valid range 0-127",
      );
    });
  });

  describe("combined selectors", () => {
    it("parses pitch with time range", () => {
      const result = parseAssignments("E3 1|1-2|1: velocity += 10");

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
      const result = parseAssignments("C1 1|1-4|1: velocity += 10");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 36,
        endPitch: 36,
      });
      expect(result[0]!.timeRange!.startBar).toBe(1);
    });

    it.each([
      ["C3-C5 1|1-2|1", 60, 84, "pitch range before time range"],
      ["1|1-2|1 C3-C5", 60, 84, "time range before pitch range"],
      ["1|1-2|1 E3", 64, 64, "time range before single pitch"],
    ])("parses %s (%s)", (input, startPitch, endPitch) => {
      const result = parseAssignments(`${input}: velocity += 10`);

      expect(result[0]!.pitchRange).toStrictEqual({ startPitch, endPitch });
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
      const result = parseAssignments("velocity = 64");

      expect(result[0]!.operator).toBe("set");
    });

    it("parses += operator", () => {
      const result = parseAssignments("velocity += 10");

      expect(result[0]!.operator).toBe("add");
    });

    it("parses -= operator as add with negated expression", () => {
      const result = parseAssignments("velocity -= 30");

      expect(result).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "add",
          expression: { type: "subtract", left: 0, right: 30 },
        },
      ]);
    });

    it("parses -= with pitch range", () => {
      const result = parseAssignments("F#1: velocity -= 30");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 42,
        endPitch: 42,
      });
      expect(result[0]!.operator).toBe("add");
      expect(result[0]!.expression).toStrictEqual({
        type: "subtract",
        left: 0,
        right: 30,
      });
    });

    it("rejects old : operator", () => {
      expect(() => parseAssignments("velocity: 10")).toThrow('but "v" found');
    });
  });

  describe("numbers", () => {
    it("parses positive integers", () => {
      const result = parseAssignments("velocity += 100");

      expect(result[0]!.expression).toBe(100);
    });

    it("parses negative integers", () => {
      const result = parseAssignments("velocity += -50");

      expect(result[0]!.expression).toBe(-50);
    });

    it("parses positive floats", () => {
      const result = parseAssignments("velocity += 10.5");

      expect(result[0]!.expression).toBe(10.5);
    });

    it("parses negative floats", () => {
      const result = parseAssignments("timing += -0.05");

      expect(result[0]!.expression).toBe(-0.05);
    });

    it("parses floats without leading zero", () => {
      const result = parseAssignments("probability += .5");

      expect(result[0]!.expression).toBe(0.5);
    });
  });

  describe("error cases", () => {
    it("throws on invalid parameter name", () => {
      expect(() => parseAssignments("invalid += 10")).toThrow('but "i" found');
    });

    it("throws on missing expression", () => {
      expect(() => parseAssignments("velocity +=")).toThrow('but "v" found');
    });

    it("throws on invalid function name", () => {
      expect(() => parseAssignments("velocity += invalid(1)")).toThrow(
        'but "v" found',
      );
    });

    it("accepts plain number as function argument", () => {
      // Plain numbers are valid (e.g., for phase or pulseWidth)
      const result = parseAssignments("velocity += cos(n/4, 0.5)");
      const expr = result[0]!.expression as FunctionNode;

      expect(expr.args[1]).toBe(0.5);
    });

    it("throws on unclosed parenthesis", () => {
      expect(() => parseAssignments("velocity += (10 + 5")).toThrow(
        'but "v" found',
      );
    });

    it("throws on unmatched closing parenthesis", () => {
      expect(() => parseAssignments("velocity += 10 + 5)")).toThrow(
        'but ")" found',
      );
    });

    it("provides labeled error for invalid parameter", () => {
      // Labels help identify valid parameters instead of raw character classes
      expect(() => parseAssignments("invalid += 10")).toThrow('but "i" found');
    });

    it("provides labeled error for missing expression", () => {
      // Labels help identify what's expected instead of raw character classes
      expect(() => parseAssignments("velocity +=")).toThrow('but "v" found');
    });
  });

  describe("real-world examples from spec", () => {
    it("parses basic envelope", () => {
      const result = parseAssignments("velocity += 20 * cos(n/1)");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(result[0]!.parameter).toBe("velocity");
      expect(expr.type).toBe("multiply");
    });

    it("parses phase-shifted envelope", () => {
      const result = parseAssignments("velocity += 20 * cos(n/1, 0.5)");
      const expr = result[0]!.expression as BinaryOpNode;
      const fn = expr.right as FunctionNode;

      expect(fn.args).toHaveLength(2);
      expect(fn.args[1]).toBe(0.5);
    });

    it("parses pulse width transform", () => {
      const result = parseAssignments("velocity += 20 * square(n/2, 0, 0.25)");
      const expr = result[0]!.expression as BinaryOpNode;
      const fn = expr.right as FunctionNode;

      expect(fn.name).toBe("square");
      expect(fn.args).toHaveLength(3);
      expect(fn.args[2]).toBe(0.25);
    });

    it("parses multi-parameter transform", () => {
      const result = parseAssignments(
        "velocity += 20 * cos(n/1) + 10 * rand()\ntiming += 0.03 * rand()\nprobability += 0.2 * cos(n/2)",
      );

      expect(result).toHaveLength(3);
      expect(result[0]!.parameter).toBe("velocity");
      expect(result[1]!.parameter).toBe("timing");
      expect(result[2]!.parameter).toBe("probability");
    });
  });

  describe("gain parameter (audio)", () => {
    it("parses gain parameter with set operator", () => {
      const result = parseAssignments("gain = -6");

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
      const result = parseAssignments("gain += 3");

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
      const result = parseAssignments("gain = -12 + 6");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("add");
      expect(expr.left).toBe(-12);
      expect(expr.right).toBe(6);
    });
  });

  describe("variable namespaces", () => {
    it("parses note.velocity with namespace", () => {
      const result = parseAssignments("velocity = note.velocity + 10");
      const expr = result[0]!.expression as BinaryOpNode;
      const variable = expr.left as VariableNode;

      expect(variable).toStrictEqual({
        type: "variable",
        namespace: "note",
        name: "velocity",
      });
    });

    it("parses audio.gain with namespace", () => {
      const result = parseAssignments("gain = audio.gain - 6");
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
        "index",
        "count",
      ];

      for (const prop of properties) {
        const result = parseAssignments(`velocity = note.${prop}`);
        const variable = result[0]!.expression as VariableNode;

        expect(variable.namespace).toBe("note");
        expect(variable.name).toBe(prop);
      }
    });

    it("parses clip.duration with namespace", () => {
      const result = parseAssignments("velocity = clip.duration");
      const variable = result[0]!.expression as VariableNode;

      expect(variable).toStrictEqual({
        type: "variable",
        namespace: "clip",
        name: "duration",
      });
    });

    it("parses all clip properties with namespace", () => {
      const properties = ["duration", "index", "position", "count"];

      for (const prop of properties) {
        const result = parseAssignments(`velocity = clip.${prop}`);
        const variable = result[0]!.expression as VariableNode;

        expect(variable.namespace).toBe("clip");
        expect(variable.name).toBe(prop);
      }
    });

    it("parses clip.barDuration", () => {
      const result = parseAssignments("velocity = clip.barDuration");
      const variable = result[0]!.expression as VariableNode;

      expect(variable).toStrictEqual({
        type: "variable",
        namespace: "clip",
        name: "barDuration",
      });
    });

    it("rejects invalid audio property", () => {
      expect(() => parseAssignments("gain = audio.velocity")).toThrow(
        'but "g" found',
      );
    });

    it("rejects invalid note property", () => {
      expect(() => parseAssignments("velocity = note.gain")).toThrow(
        'but "v" found',
      );
    });

    it("rejects invalid clip property", () => {
      expect(() => parseAssignments("velocity = clip.invalid")).toThrow(
        'but "v" found',
      );
    });

    it("rejects invalid bar property", () => {
      expect(() => parseAssignments("velocity = bar.invalid")).toThrow(
        'but "v" found',
      );
    });

    it("parses next.pitch with namespace", () => {
      const result = parseAssignments("velocity = next.pitch");
      const variable = result[0]!.expression as VariableNode;

      expect(variable).toStrictEqual({
        type: "variable",
        namespace: "next",
        name: "pitch",
      });
    });

    it("parses all next properties with namespace", () => {
      const properties = [
        "pitch",
        "velocity",
        "deviation",
        "probability",
        "duration",
        "start",
      ];

      for (const prop of properties) {
        const result = parseAssignments(`velocity = next.${prop}`);
        const variable = result[0]!.expression as VariableNode;

        expect(variable.namespace).toBe("next");
        expect(variable.name).toBe(prop);
      }
    });

    it("rejects next.index (not a valid next property)", () => {
      expect(() => parseAssignments("velocity = next.index")).toThrow(
        'but "v" found',
      );
    });

    it("rejects next.count (not a valid next property)", () => {
      expect(() => parseAssignments("velocity = next.count")).toThrow(
        'but "v" found',
      );
    });
  });

  describe("pitch parameter", () => {
    it("parses pitch parameter with set operator", () => {
      const result = parseAssignments("pitch = 60");

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
      const result = parseAssignments("pitch += 12");

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
      const result = parseAssignments("pitch += -12");

      expect(result[0]!.expression).toBe(-12);
    });

    it("parses pitch with pitch range filter", () => {
      const result = parseAssignments("C3: pitch += 12");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 60,
        endPitch: 60,
      });
      expect(result[0]!.parameter).toBe("pitch");
    });

    it("parses pitch with time range filter", () => {
      const result = parseAssignments("1|1-2|4: pitch += 12");

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
      const result = parseAssignments("pitch = C3");

      expect(result[0]!.expression).toStrictEqual({
        type: "pitchLiteral",
        value: 60,
        name: "C3",
      });
    });

    it("parses pitch literal with sharp", () => {
      const result = parseAssignments("pitch = C#3");

      expect((result[0]!.expression as PitchLiteralNode).value).toBe(61);
    });

    it("parses pitch literal with flat", () => {
      const result = parseAssignments("pitch = Db3");

      expect((result[0]!.expression as PitchLiteralNode).value).toBe(61);
    });

    it("parses pitch literal in arithmetic expression", () => {
      const result = parseAssignments("pitch = C3 + 7");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("add");
      expect((expr.left as PitchLiteralNode).value).toBe(60);
      expect(expr.right).toBe(7);
    });

    it("parses pitch literal with negative octave", () => {
      const result = parseAssignments("pitch = C-1");

      expect((result[0]!.expression as PitchLiteralNode).value).toBe(12);
    });

    it("parses lowest valid pitch literal C-2", () => {
      const result = parseAssignments("pitch = C-2");

      expect((result[0]!.expression as PitchLiteralNode).value).toBe(0);
    });

    it("parses highest valid pitch literal G8", () => {
      const result = parseAssignments("pitch = G8");

      expect((result[0]!.expression as PitchLiteralNode).value).toBe(127);
    });

    it("throws on pitch literal out of range (too high)", () => {
      expect(() => parseAssignments("pitch = C9")).toThrow(
        /outside valid range/,
      );
    });

    it("throws on pitch literal out of range (too low)", () => {
      expect(() => parseAssignments("pitch = C-3")).toThrow(
        /outside valid range/,
      );
    });

    it("parses pitch literal in complex expression", () => {
      const result = parseAssignments("pitch = (C3 + G3) / 2");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("divide");
      expect((expr.left as BinaryOpNode).type).toBe("add");
      expect(((expr.left as BinaryOpNode).left as PitchLiteralNode).value).toBe(
        60,
      );
      expect(
        ((expr.left as BinaryOpNode).right as PitchLiteralNode).value,
      ).toBe(67);
      expect(expr.right).toBe(2);
    });

    it("parses pitch literal with note variable", () => {
      const result = parseAssignments("pitch = C3 + note.pitch");
      const expr = result[0]!.expression as BinaryOpNode;

      expect(expr.type).toBe("add");
      expect((expr.left as PitchLiteralNode).value).toBe(60);
      expect((expr.right as VariableNode).name).toBe("pitch");
    });

    it("parses case-insensitive, Unicode, and enharmonic pitch literals", () => {
      // Same tolerance as the bar|beat note layer, locked across both grammars
      // by pitch-class-grammar-parity.test.ts. Enharmonics wrap the octave: B#
      // resolves up to C, Cb down to B.
      const value = (s: string): number =>
        (parseAssignments(s)[0]!.expression as PitchLiteralNode).value;

      expect(value("pitch = c3")).toBe(60);
      expect(value("pitch = gb1")).toBe(42);
      expect(value("pitch = C♯1")).toBe(37);
      expect(value("pitch = E#3")).toBe(65); // → F3
      expect(value("pitch = B#3")).toBe(72); // → C4
      expect(value("pitch = Cb4")).toBe(71); // → B3
    });
  });

  describe("legato function", () => {
    it("parses legato() as a function call with no arguments", () => {
      const result = parseAssignments("duration = legato()");
      const fn = result[0]!.expression as FunctionNode;

      expect(fn).toStrictEqual({
        type: "function",
        name: "legato",
        args: [],
        sync: false,
        raw: false,
      });
    });
  });
});
