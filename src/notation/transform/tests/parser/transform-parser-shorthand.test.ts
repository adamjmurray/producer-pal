// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseAssignments } from "./parse-test-helpers.ts";

// "v-10" desugars to an add of the negation (matching "velocity -= 10"),
// asserted from two angles: additive shorthand and the no-shadow guard.
const V_MINUS_10_ADD_OF_NEGATION = [
  {
    pitchRange: null,
    timeRange: null,
    parameter: "velocity",
    operator: "add",
    expression: { type: "subtract", left: 0, right: 10 },
  },
];

describe("Transform Parser - shorthand", () => {
  describe("desugars identically to full forms", () => {
    it.each([
      ["v100", "velocity = 100"],
      ["v0", "velocity = 0"],
      ["delete", "velocity = 0"],
      ["delete", "v0"],
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
      expect(parseAssignments(shorthand)).toStrictEqual(
        parseAssignments(fullForm),
      );
    });
  });

  describe("additive operator shorthand (v±N, p±N)", () => {
    it("desugars v+10 to velocity add", () => {
      expect(parseAssignments("v+10")).toStrictEqual([
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
      expect(parseAssignments("v-10")).toStrictEqual(
        V_MINUS_10_ADD_OF_NEGATION,
      );
    });

    it("desugars p+0.1 to probability add", () => {
      expect(parseAssignments("p+0.1")).toStrictEqual([
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
      expect(parseAssignments("p-0.1")).toStrictEqual([
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
      expect(parseAssignments("C1: v-10")[0]).toStrictEqual({
        pitchRange: { startPitch: 36, endPitch: 36 },
        timeRange: null,
        parameter: "velocity",
        operator: "add",
        expression: { type: "subtract", left: 0, right: 10 },
      });
    });

    it("rejects additive shorthand for duration (n/4+1)", () => {
      expect(() => parseAssignments("n/4+1")).toThrow();
    });

    it("rejects additive shorthand for pitch (C4+5)", () => {
      expect(() => parseAssignments("C4+5")).toThrow();
    });
  });

  describe("velocity shorthand", () => {
    it("desugars v100 to velocity set", () => {
      expect(parseAssignments("v100")).toStrictEqual([
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
      expect(parseAssignments("v0")[0]).toMatchObject({
        parameter: "velocity",
        operator: "set",
        expression: 0,
      });
    });
  });

  describe("delete shorthand (alias for v0)", () => {
    it("parses to the same velocity-set-0 AST as v0", () => {
      expect(parseAssignments("delete")[0]).toMatchObject({
        pitchRange: null,
        timeRange: null,
        parameter: "velocity",
        operator: "set",
        expression: 0,
      });
    });

    it("accepts a pitch selector (C1: delete)", () => {
      expect(parseAssignments("C1: delete")[0]).toMatchObject({
        pitchRange: { startPitch: 36, endPitch: 36 },
        parameter: "velocity",
        operator: "set",
        expression: 0,
      });
    });

    it("composes with a where() predicate", () => {
      const [assignment] = parseAssignments(
        "where(note.velocity < 40): delete",
      );

      expect(assignment).toMatchObject({
        predicate: { type: "comparison", op: "<" },
        parameter: "velocity",
        operator: "set",
        expression: 0,
      });
    });

    it("is rejected as an expression value (velocity = delete)", () => {
      expect(() => parseAssignments("velocity = delete")).toThrow(
        /delete is a shorthand action, not a value/,
      );
    });

    it("is rejected inside an arithmetic expression (velocity = 1 + delete)", () => {
      expect(() => parseAssignments("velocity = 1 + delete")).toThrow(
        /delete is a shorthand action, not a value/,
      );
    });
  });

  describe("velocity range shorthand (vA-B)", () => {
    it("desugars v80-120 to velocity set + deviation set", () => {
      expect(parseAssignments("v80-120")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "velocity",
          operator: "set",
          expression: 80,
        },
        {
          pitchRange: null,
          timeRange: null,
          parameter: "deviation",
          operator: "set",
          expression: 40,
        },
      ]);
    });

    it("swaps reversed bounds (v120-80)", () => {
      const result = parseAssignments("v120-80");

      expect(result[0]).toMatchObject({
        parameter: "velocity",
        expression: 80,
      });
      expect(result[1]).toMatchObject({
        parameter: "deviation",
        expression: 40,
      });
    });

    it("clamps each bound to 0-127 before deviation (v200-250 → 127, dev 0)", () => {
      const result = parseAssignments("v200-250");

      expect(result[0]).toMatchObject({
        parameter: "velocity",
        expression: 127,
      });
      expect(result[1]).toMatchObject({
        parameter: "deviation",
        expression: 0,
      });
    });

    it("equal bounds give zero deviation (v100-100)", () => {
      const result = parseAssignments("v100-100");

      expect(result[0]).toMatchObject({
        parameter: "velocity",
        expression: 100,
      });
      expect(result[1]).toMatchObject({
        parameter: "deviation",
        expression: 0,
      });
    });

    it("rejects a 0 lower bound (v0 is the delete sentinel, not a range floor)", () => {
      // Mirrors the barbeat grammar guard: base velocity 0 is the delete
      // sentinel, so a range with a 0 lower bound would silently delete notes.
      // The single `min === 0` check covers both orderings and equal bounds.
      const v0Error =
        /velocity ranges must start at 1 or higher — v0 is the delete sentinel/;

      expect(() => parseAssignments("v0-100")).toThrow(v0Error);
      expect(() => parseAssignments("v100-0")).toThrow(v0Error);
      expect(() => parseAssignments("v0-0")).toThrow(v0Error);
      expect(() => parseAssignments("v0-100")).toThrow(/"v0-100" is invalid/);
    });

    it("does not shadow additive shorthand (v-10 stays a subtract)", () => {
      expect(parseAssignments("v-10")).toStrictEqual(
        V_MINUS_10_ADD_OF_NEGATION,
      );
    });

    it("applies a pitch selector to both emitted assignments (C1: v80-120)", () => {
      const result = parseAssignments("C1: v80-120");

      expect(result).toHaveLength(2);
      expect(result[0]).toStrictEqual({
        pitchRange: { startPitch: 36, endPitch: 36 },
        timeRange: null,
        parameter: "velocity",
        operator: "set",
        expression: 80,
      });
      expect(result[1]).toStrictEqual({
        pitchRange: { startPitch: 36, endPitch: 36 },
        timeRange: null,
        parameter: "deviation",
        operator: "set",
        expression: 40,
      });
    });

    it("applies a combined pitch + time selector to both (E3 1|1-2|1: v80-120)", () => {
      const result = parseAssignments("E3 1|1-2|1: v80-120");

      expect(result).toHaveLength(2);

      for (const assignment of result) {
        expect(assignment.pitchRange).toStrictEqual({
          startPitch: 64,
          endPitch: 64,
        });
        expect(assignment.timeRange).toStrictEqual({
          startBar: 1,
          startBeat: 1,
          endBar: 2,
          endBeat: 1,
        });
      }
    });

    it("flattens correctly alongside other lines (v80-120 then p0.5)", () => {
      const result = parseAssignments("v80-120\np0.5");

      expect(result.map((a) => a.parameter)).toStrictEqual([
        "velocity",
        "deviation",
        "probability",
      ]);
    });
  });

  describe("probability shorthand", () => {
    it("desugars p0.5 to probability set", () => {
      expect(parseAssignments("p0.5")).toStrictEqual([
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
      expect(parseAssignments("p.5")[0]!.expression).toBe(0.5);
    });
  });

  describe("duration shorthand", () => {
    it("desugars n/4 to duration set with nDuration node", () => {
      expect(parseAssignments("n/4")).toStrictEqual([
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
      expect(() => parseAssignments("n4")).toThrow(/denominator/);
    });
  });

  describe("bare-pitch shorthand", () => {
    it("desugars C4 to pitch set", () => {
      expect(parseAssignments("C4")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          parameter: "pitch",
          operator: "set",
          expression: { type: "pitchLiteral", value: 72, name: "C4" }, // C4 = MIDI 72
        },
      ]);
    });

    it("rejects a pitch range as body (C4-C5)", () => {
      expect(() => parseAssignments("C4-C5")).toThrow();
    });
  });

  describe("with selectors", () => {
    it("applies pitch selector to velocity shorthand", () => {
      expect(parseAssignments("C1: v100")[0]).toStrictEqual({
        pitchRange: { startPitch: 36, endPitch: 36 },
        timeRange: null,
        parameter: "velocity",
        operator: "set",
        expression: 100,
      });
    });

    it("applies pitch selector to bare-pitch shorthand (C1: C4)", () => {
      expect(parseAssignments("C1: C4")[0]).toStrictEqual({
        pitchRange: { startPitch: 36, endPitch: 36 },
        timeRange: null,
        parameter: "pitch",
        operator: "set",
        expression: { type: "pitchLiteral", value: 72, name: "C4" },
      });
    });

    it("applies combined pitch + time selector", () => {
      expect(parseAssignments("E3 1|1-2|1: v0")[0]).toStrictEqual({
        pitchRange: { startPitch: 64, endPitch: 64 },
        timeRange: { startBar: 1, startBeat: 1, endBar: 2, endBeat: 1 },
        parameter: "velocity",
        operator: "set",
        expression: 0,
      });
    });

    it("applies time selector to duration shorthand", () => {
      expect(parseAssignments("1|1-2|1: n/8")[0]).toStrictEqual({
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
      const result = parseAssignments("v100\np0.5\nC1: C4");

      expect(result).toHaveLength(3);
      expect(result[0]!.parameter).toBe("velocity");
      expect(result[1]!.parameter).toBe("probability");
      expect(result[2]!.parameter).toBe("pitch");
    });

    it("mixes shorthand and full forms across lines", () => {
      const result = parseAssignments("v100\nvelocity += 10");

      expect(result[0]!.operator).toBe("set");
      expect(result[1]!.operator).toBe("add");
    });
  });

  describe("disambiguation errors", () => {
    it("rejects selector without colon (C1 C4)", () => {
      expect(() => parseAssignments("C1 C4")).toThrow();
    });

    it("rejects stacking two changes on one line (C1: C4 v100)", () => {
      expect(() => parseAssignments("C1: C4 v100")).toThrow();
    });

    it("rejects bare token prefix with no value (v)", () => {
      expect(() => parseAssignments("v")).toThrow();
    });
  });
});
