// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Pathological / confusable input regression for the bar|beat grammar.
//
// grammar-roundtrip-property.test.ts fuzzes the ASCII notation alphabet; this
// file pins the named adversarial inputs a model (or a copy-paste) realistically
// produces — invisible Unicode, look-alike fullwidth glyphs, structurally
// degenerate brackets, and a pathologically deep (but non-recursive) pattern
// voice. The contract is: every one of these either parses or fails with a clean
// bar|beat syntax error — none crashes the process (a RangeError stack overflow)
// or hangs. A grammar that recursed on bracket depth, or threw a raw TypeError on
// an unexpected code point, would regress here.

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";

const OPTS = { timeSigNumerator: 4, timeSigDenominator: 4 };

// Assert a source is REJECTED gracefully: it throws, the throw is a normal Error
// (not a RangeError stack overflow), and it carries the formatted syntax-error
// message rather than a raw internal failure.
function expectGracefulReject(source: string): void {
  let thrown: unknown;

  try {
    interpretNotation(source, OPTS);
  } catch (error) {
    thrown = error;
  }

  expect(thrown, `expected "${source}" to be rejected`).toBeInstanceOf(Error);
  expect(thrown).not.toBeInstanceOf(RangeError);
  expect((thrown as Error).message).toContain("bar|beat syntax error");
}

describe("pathological and confusable notation input", () => {
  describe("invisible / look-alike Unicode fails with a clean syntax error", () => {
    const CONFUSABLES: ReadonlyArray<readonly [string, string]> = [
      ["leading BOM", "﻿C3 1|1"],
      ["trailing BOM", "C3 1|1﻿"],
      ["zero-width space inside a pitch", "C3​ 1|1"],
      ["fullwidth letters and bar", "Ａ３ １｜１"],
      ["fullwidth digits only", "C3 １｜１"],
    ];

    for (const [name, source] of CONFUSABLES) {
      it(`${name} → graceful reject`, () => {
        expectGracefulReject(source);
      });
    }
  });

  describe("structurally degenerate input is handled, never crashes", () => {
    it("an unbalanced opening bracket rejects gracefully", () => {
      expectGracefulReject("[C3 1|1");
    });

    it("an unbalanced closing bracket rejects gracefully", () => {
      expectGracefulReject("C3] 1|1");
    });

    it("a lone bracket pair rejects gracefully", () => {
      expectGracefulReject("[]");
    });

    it("empty and whitespace-only input parse to no notes", () => {
      expect(interpretNotation("", OPTS)).toStrictEqual([]);
      expect(interpretNotation("   ", OPTS)).toStrictEqual([]);
      expect(interpretNotation("\t\n  \t", OPTS)).toStrictEqual([]);
    });
  });

  describe("degenerate scale does not overflow the stack", () => {
    it("a very deep flat pattern voice parses without recursion blowup", () => {
      // Pattern voices are flat lists, not nested structures — an 800-pitch
      // `[C1 C1 …]` must parse iteratively, never recurse to a RangeError.
      const source = `[${"C1 ".repeat(800)}] 1|1`;
      const result = interpretNotation(source, OPTS);

      expect(Array.isArray(result)).toBe(true);
      // One emission at the single time position (the voice cycles by cursor).
      expect(result).toHaveLength(1);
    });

    it("a very long flat position sequence parses without blowup", () => {
      // 400 positions back to back — long, but linear in the input.
      const positions = Array.from(
        { length: 400 },
        (_unused, i) => `C1 ${(i % 4) + 1}|1`,
      ).join(" ");
      const result = interpretNotation(positions, OPTS);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
