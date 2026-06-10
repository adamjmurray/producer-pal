// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";
import { parseAssignments } from "./parse-test-helpers.ts";

describe("Transform Parser - where() predicate", () => {
  describe("basic comparisons", () => {
    it("parses a where()-only line (no positional selector)", () => {
      const result = parseAssignments(
        "where(note.velocity < 40): velocity = 0",
      );

      expect(result[0]!.pitchRange).toBeNull();
      expect(result[0]!.timeRange).toBeNull();
      expect(result[0]!.predicate).toStrictEqual({
        type: "comparison",
        op: "<",
        left: { type: "variable", namespace: "note", name: "velocity" },
        right: 40,
      });
    });

    it("omits predicate on a line with no where()", () => {
      const result = parseAssignments("C3: velocity += 10");

      expect(result[0]!.predicate).toBeUndefined();
    });

    it("parses each comparison operator", () => {
      const ops = [">", ">=", "<", "<=", "==", "!="] as const;

      for (const op of ops) {
        const result = parseAssignments(
          `where(note.velocity ${op} 80): velocity = 0`,
        );

        expect(result[0]!.predicate).toStrictEqual({
          type: "comparison",
          op,
          left: { type: "variable", namespace: "note", name: "velocity" },
          right: 80,
        });
      }
    });

    it("tolerates missing whitespace around the operator", () => {
      const result = parseAssignments("where(note.velocity>80): v0");

      expect(result[0]!.predicate).toStrictEqual({
        type: "comparison",
        op: ">",
        left: { type: "variable", namespace: "note", name: "velocity" },
        right: 80,
      });
    });

    it("accepts each of the six intrinsic note properties", () => {
      const props = [
        "velocity",
        "deviation",
        "duration",
        "probability",
        "pitch",
        "start",
      ];

      for (const name of props) {
        const result = parseAssignments(`where(note.${name} > 1): v0`);
        const predicate = result[0]!.predicate as { left: unknown };

        expect(predicate.left).toStrictEqual({
          type: "variable",
          namespace: "note",
          name,
        });
      }
    });
  });

  describe("RHS forms", () => {
    it("allows a pitch literal on the RHS", () => {
      const result = parseAssignments("where(note.pitch >= C3): v0");
      const predicate = result[0]!.predicate as { right: unknown };

      expect(predicate.right).toStrictEqual({
        type: "pitchLiteral",
        value: 60,
        name: "C3",
      });
    });

    it("allows a note-value duration on the RHS", () => {
      const result = parseAssignments("where(note.duration < n/8): v0");
      const predicate = result[0]!.predicate as { right: unknown };

      expect(predicate.right).toStrictEqual({
        type: "nDuration",
        wholeNoteFraction: 0.125,
      });
    });

    it("allows arithmetic on either side (cross-property)", () => {
      const result = parseAssignments(
        "where(note.velocity > note.duration * 100): v0",
      );

      expect(result[0]!.predicate).toStrictEqual({
        type: "comparison",
        op: ">",
        left: { type: "variable", namespace: "note", name: "velocity" },
        right: {
          type: "multiply",
          left: { type: "variable", namespace: "note", name: "duration" },
          right: 100,
        },
      });
    });
  });

  describe("function operands (AJM-517)", () => {
    it("allows a math function on either side", () => {
      const result = parseAssignments("where(abs(note.start - 4) < 1): v0");

      expect(result[0]!.predicate).toStrictEqual({
        type: "comparison",
        op: "<",
        left: {
          type: "function",
          name: "abs",
          sync: false,
          raw: false,
          args: [
            {
              type: "subtract",
              left: { type: "variable", namespace: "note", name: "start" },
              right: 4,
            },
          ],
        },
        right: 1,
      });
    });

    it("allows a variadic math function with note-property args", () => {
      const result = parseAssignments(
        "where(min(note.velocity, note.deviation) > 80): v0",
      );
      const predicate = result[0]!.predicate as { left: { name: string } };

      expect(predicate.left.name).toBe("min");
    });

    it("allows a waveform function", () => {
      const result = parseAssignments("where(sin(n/4) > 0): v0");
      const predicate = result[0]!.predicate as { left: { name: string } };

      expect(predicate.left.name).toBe("sin");
    });

    it("allows clipseq() (clip axis is available at selection time)", () => {
      const result = parseAssignments("where(clipseq(0, 1) == 1): v0");
      const predicate = result[0]!.predicate as { left: { name: string } };

      expect(predicate.left.name).toBe("clipseq");
    });
  });

  describe("boolean operators and grouping", () => {
    it("gives DNF precedence: && binds tighter than ||", () => {
      const result = parseAssignments(
        "where(note.velocity > 80 && note.pitch > 60 || note.velocity < 20 && note.pitch < 40): v0",
      );

      expect(result[0]!.predicate!.type).toBe("or");
      const or = result[0]!.predicate as {
        left: { type: string };
        right: { type: string };
      };

      expect(or.left.type).toBe("and");
      expect(or.right.type).toBe("and");
    });

    it("groups a comparison in parens (reflexive paren)", () => {
      const result = parseAssignments("where((note.velocity > 80)): v0");

      expect(result[0]!.predicate).toStrictEqual({
        type: "comparison",
        op: ">",
        left: { type: "variable", namespace: "note", name: "velocity" },
        right: 80,
      });
    });

    it("overrides precedence with boolean grouping a && (b || c)", () => {
      const result = parseAssignments(
        "where(note.velocity > 80 && (note.pitch > 60 || note.pitch < 40)): v0",
      );

      expect(result[0]!.predicate!.type).toBe("and");
      const and = result[0]!.predicate as { right: { type: string } };

      expect(and.right.type).toBe("or");
    });

    it("parses logical NOT", () => {
      const result = parseAssignments("where(!(note.velocity > 80)): v0");

      expect(result[0]!.predicate).toStrictEqual({
        type: "not",
        operand: {
          type: "comparison",
          op: ">",
          left: { type: "variable", namespace: "note", name: "velocity" },
          right: 80,
        },
      });
    });

    it("keeps arithmetic grouping working inside a comparison operand", () => {
      const result = parseAssignments("where((1 + 2) > note.start): v0");
      const predicate = result[0]!.predicate as { left: unknown };

      expect(predicate.left).toStrictEqual({
        type: "add",
        left: 1,
        right: 2,
      });
    });
  });

  describe("combination with positional selectors", () => {
    it("AND-combines a pitch range with a predicate", () => {
      const result = parseAssignments(
        "C3-C5 where(note.velocity > 80): velocity += 20",
      );

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 60,
        endPitch: 84,
      });
      expect(result[0]!.predicate).toStrictEqual({
        type: "comparison",
        op: ">",
        left: { type: "variable", namespace: "note", name: "velocity" },
        right: 80,
      });
    });

    it("AND-combines a time range with a predicate", () => {
      const result = parseAssignments(
        "1|1-2|1 where(note.probability < .5): v0",
      );

      expect(result[0]!.timeRange).not.toBeNull();
      expect(result[0]!.predicate!.type).toBe("comparison");
    });

    it("applies the predicate to every body of a range shorthand (vA-B)", () => {
      const result = parseAssignments("where(note.pitch > 60): v80-120");

      // vA-B desugars to two assignments (velocity + deviation); both share the
      // predicate.
      expect(result).toHaveLength(2);
      expect(result[0]!.predicate!.type).toBe("comparison");
      expect(result[1]!.predicate!.type).toBe("comparison");
    });

    it("accepts an optional colon between the selector and where() (LLM habit)", () => {
      // `Gb1: where(...): body` — a colon separator between the positional
      // selector and the predicate, in addition to the canonical space form.
      const result = parseAssignments(
        "Gb1: where(note.velocity > 90): velocity = 120",
      );

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 42,
        endPitch: 42,
      });
      expect(result[0]!.predicate).toStrictEqual({
        type: "comparison",
        op: ">",
        left: { type: "variable", namespace: "note", name: "velocity" },
        right: 90,
      });
    });

    it("accepts the colon separator after a time range too", () => {
      const result = parseAssignments(
        "1|1-2|1: where(note.probability < .5): v0",
      );

      expect(result[0]!.timeRange).not.toBeNull();
      expect(result[0]!.predicate!.type).toBe("comparison");
    });

    it("still parses a positional-only colon selector (no where())", () => {
      // The optional separator must not swallow the prefix-terminating colon when
      // no where() follows.
      const result = parseAssignments("Gb1: velocity = 120");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 42,
        endPitch: 42,
      });
      expect(result[0]!.predicate).toBeUndefined();
    });

    it("accepts where() BEFORE the positional selector (order-free)", () => {
      // The segment list is order-free: where() may lead, with or without a colon.
      for (const input of [
        "where(note.velocity > 90) Gb1: velocity = 120",
        "where(note.velocity > 90): Gb1: velocity = 120",
      ]) {
        const result = parseAssignments(input);

        expect(result[0]!.pitchRange).toStrictEqual({
          startPitch: 42,
          endPitch: 42,
        });
        expect(result[0]!.predicate!.type).toBe("comparison");
      }
    });

    it("accepts all three segments (pitch, time, where) in any order", () => {
      const result = parseAssignments(
        "where(note.velocity > 90) 1|1-2|1 Gb1: velocity = 120",
      );

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 42,
        endPitch: 42,
      });
      expect(result[0]!.timeRange).not.toBeNull();
      expect(result[0]!.predicate!.type).toBe("comparison");
    });

    it("leaves a bare-pitch body intact after a pitch selector (C1: C4)", () => {
      // A bare pitch is also a valid body (set pitch). The selector C1 must not
      // swallow the body C4 as a second pitch segment.
      const result = parseAssignments("C1: C4");

      expect(result[0]!.pitchRange).toStrictEqual({
        startPitch: 36,
        endPitch: 36,
      });
      expect(result[0]!.parameter).toBe("pitch");
      expect(result[0]!.expression).toStrictEqual({
        type: "pitchLiteral",
        value: 72,
        name: "C4",
      });
    });
  });

  describe("duplicate selector segments", () => {
    // A duplicate is warn-and-skipped, not a hard parse error: the line carries a
    // `selectorWarning` the evaluator relays before skipping just that line, so
    // the other lines still apply. (Evaluator behavior is covered in
    // transform-where.test.ts.)
    it("flags two pitch selectors with guidance to use a range", () => {
      const result = parseAssignments("C3: E3: velocity = 120");

      expect(result[0]!.selectorWarning).toMatch(
        /duplicate pitch selector .*range like C3-E3/,
      );
    });

    it("flags two time selectors", () => {
      const result = parseAssignments("1|1-2|1: 3|1-4|1: v0");

      expect(result[0]!.selectorWarning).toMatch(/duplicate time selector/);
    });

    it("flags two where() clauses with guidance to use &&/||", () => {
      const result = parseAssignments(
        "where(note.pitch > 60): where(note.pitch < 70): v0",
      );

      expect(result[0]!.selectorWarning).toMatch(
        /duplicate where\(\).*&& \/ \|\|/,
      );
    });

    it("leaves well-formed lines without a selectorWarning", () => {
      const result = parseAssignments("C3-C5 where(note.velocity > 80): v0");

      expect(result[0]!.selectorWarning).toBeUndefined();
    });
  });

  describe("rejected forms", () => {
    it("rejects a selection-derived note property (index)", () => {
      expect(() => parser.parse("where(note.index > 2): v0")).toThrow(
        /can only reference note properties/,
      );
    });

    it("rejects note.count", () => {
      expect(() => parser.parse("where(note.count > 4): v0")).toThrow(
        /can only reference note properties/,
      );
    });

    it("rejects a next.* lookahead", () => {
      expect(() => parser.parse("where(next.velocity > 80): v0")).toThrow(
        /can only reference note properties/,
      );
    });

    it("rejects a clip.* variable", () => {
      expect(() => parser.parse("where(clip.index > 0): v0")).toThrow(
        /can only reference note properties/,
      );
    });

    it("rejects legato() — it needs the finalized selection", () => {
      expect(() => parser.parse("where(legato() > 1): v0")).toThrow(
        /can't use legato\(\).*legato target/,
      );
    });

    it("rejects seq() — it cycles by note.index", () => {
      expect(() => parser.parse("where(seq(0, 1) == 1): v0")).toThrow(
        /can't use seq\(\).*note\.index/,
      );
    });

    it("rejects a selection-derived variable nested in a function arg", () => {
      expect(() => parser.parse("where(abs(note.index) < 2): v0")).toThrow(
        /can only reference note properties/,
      );
    });

    it("rejects where() on a note-count op (ratchet)", () => {
      expect(() =>
        parser.parse("where(note.velocity > 80): ratchet(2)"),
      ).toThrow(/not supported on note-count operations/);
    });

    it("rejects where() on a note-count op (merge)", () => {
      expect(() => parser.parse("where(note.velocity > 80): merge()")).toThrow(
        /not supported on note-count operations/,
      );
    });

    it("keeps comparison operators illegal on an assignment RHS", () => {
      expect(() => parser.parse("velocity = note.velocity > 80")).toThrow();
    });
  });
});
