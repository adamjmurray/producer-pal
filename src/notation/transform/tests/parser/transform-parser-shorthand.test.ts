// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - shorthand", () => {
  describe("desugars identically to full forms", () => {
    it.each([
      ["v100", "velocity = 100"],
      ["v0", "velocity = 0"],
      ["p0.5", "probability = 0.5"],
      ["p1", "probability = 1"],
      ["n/4", "duration = n/4"],
      ["n3/8", "duration = n3/8"],
      ["C4", "pitch = C4"],
      ["C#3", "pitch = C#3"],
      ["v+10", "velocity += 10"],
      ["v-10", "velocity -= 10"],
      ["p+0.1", "probability += 0.1"],
      ["p-0.1", "probability -= 0.1"],
    ])("%s desugars to %s", (shorthand, fullForm) => {
      expect(parser.parse(shorthand)).toStrictEqual(parser.parse(fullForm));
    });
  });

  describe("additive operator shorthand (v±N, p±N)", () => {
    it("desugars v+10 to velocity add", () => {
      expect(parser.parse("v+10")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "add",
          expression: 10,
        },
      ]);
    });

    it("desugars v-10 to add-of-negation (matches -=)", () => {
      expect(parser.parse("v-10")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "add",
          expression: { type: "subtract", left: 0, right: 10 },
        },
      ]);
    });

    it("desugars p+0.1 to probability add", () => {
      expect(parser.parse("p+0.1")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "probability",
          operator: "add",
          expression: 0.1,
        },
      ]);
    });

    it("desugars p-0.1 to add-of-negation (matches -=)", () => {
      expect(parser.parse("p-0.1")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "probability",
          operator: "add",
          expression: { type: "subtract", left: 0, right: 0.1 },
        },
      ]);
    });

    it("applies a selector to additive shorthand (C1: v-10)", () => {
      expect(parser.parse("C1: v-10")[0]).toStrictEqual({
        pitchRange: { startPitch: 36, endPitch: 36 },
        timeRange: null,
        parameter: "velocity",
        operator: "add",
        expression: { type: "subtract", left: 0, right: 10 },
      });
    });

    it("rejects additive shorthand for duration (n/4+1)", () => {
      expect(() => parser.parse("n/4+1")).toThrow();
    });

    it("rejects additive shorthand for pitch (C4+5)", () => {
      expect(() => parser.parse("C4+5")).toThrow();
    });
  });

  describe("velocity shorthand", () => {
    it("desugars v100 to velocity set", () => {
      expect(parser.parse("v100")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "set",
          expression: 100,
        },
      ]);
    });

    it("v0 sets velocity to 0 (delete sentinel)", () => {
      expect(parser.parse("v0")[0]).toMatchObject({
        parameter: "velocity",
        operator: "set",
        expression: 0,
      });
    });
  });

  describe("probability shorthand", () => {
    it("desugars p0.5 to probability set", () => {
      expect(parser.parse("p0.5")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "probability",
          operator: "set",
          expression: 0.5,
        },
      ]);
    });

    it("accepts probability without leading zero", () => {
      expect(parser.parse("p.5")[0]!.expression).toBe(0.5);
    });
  });

  describe("duration shorthand", () => {
    it("desugars n/4 to duration set with nDuration node", () => {
      expect(parser.parse("n/4")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "duration",
          operator: "set",
          expression: { type: "nDuration", wholeNoteFraction: 0.25 },
        },
      ]);
    });

    it("throws denominator error on bare integer (n4)", () => {
      expect(() => parser.parse("n4")).toThrow(/denominator/);
    });
  });

  describe("bare-pitch shorthand", () => {
    it("desugars C4 to pitch set", () => {
      expect(parser.parse("C4")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "pitch",
          operator: "set",
          expression: 72, // C4 = MIDI 72
        },
      ]);
    });

    it("rejects a pitch range as body (C4-C5)", () => {
      expect(() => parser.parse("C4-C5")).toThrow();
    });
  });

  describe("with selectors", () => {
    it("applies pitch selector to velocity shorthand", () => {
      expect(parser.parse("C1: v100")[0]).toStrictEqual({
        pitchRange: { startPitch: 36, endPitch: 36 },
        timeRange: null,
        parameter: "velocity",
        operator: "set",
        expression: 100,
      });
    });

    it("applies pitch selector to bare-pitch shorthand (C1: C4)", () => {
      expect(parser.parse("C1: C4")[0]).toStrictEqual({
        pitchRange: { startPitch: 36, endPitch: 36 },
        timeRange: null,
        parameter: "pitch",
        operator: "set",
        expression: 72,
      });
    });

    it("applies combined pitch + time selector", () => {
      expect(parser.parse("E3 1|1-2|1: v0")[0]).toStrictEqual({
        pitchRange: { startPitch: 64, endPitch: 64 },
        timeRange: { startBar: 1, startBeat: 1, endBar: 2, endBeat: 1 },
        parameter: "velocity",
        operator: "set",
        expression: 0,
      });
    });

    it("applies time selector to duration shorthand", () => {
      expect(parser.parse("1|1-2|1: n/8")[0]).toStrictEqual({
        pitchRange: null,
        timeRange: { startBar: 1, startBeat: 1, endBar: 2, endBeat: 1 },
        parameter: "duration",
        operator: "set",
        expression: { type: "nDuration", wholeNoteFraction: 0.125 },
      });
    });
  });

  describe("shorthand across multiple lines", () => {
    it("parses one shorthand per line", () => {
      const result = parser.parse("v100\np0.5\nC1: C4");

      expect(result).toHaveLength(3);
      expect(result[0]!.parameter).toBe("velocity");
      expect(result[1]!.parameter).toBe("probability");
      expect(result[2]!.parameter).toBe("pitch");
    });

    it("mixes shorthand and full forms across lines", () => {
      const result = parser.parse("v100\nvelocity += 10");

      expect(result[0]!.operator).toBe("set");
      expect(result[1]!.operator).toBe("add");
    });
  });

  describe("disambiguation errors", () => {
    it("rejects selector without colon (C1 C4)", () => {
      expect(() => parser.parse("C1 C4")).toThrow();
    });

    it("rejects stacking two changes on one line (C1: C4 v100)", () => {
      expect(() => parser.parse("C1: C4 v100")).toThrow();
    });

    it("rejects bare token prefix with no value (v)", () => {
      expect(() => parser.parse("v")).toThrow();
    });
  });
});
