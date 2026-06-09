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

    it("rejects a function call (deferred to a fast-follow)", () => {
      expect(() => parser.parse("where(abs(note.start) < 1): v0")).toThrow(
        /don't support functions yet/,
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
