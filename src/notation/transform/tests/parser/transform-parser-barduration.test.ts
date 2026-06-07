// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseAssignments } from "./parse-test-helpers.ts";

describe("Transform Parser - barDuration (Nbar)", () => {
  it("parses 1bar as a barDuration node", () => {
    const result = parseAssignments("duration = 1bar");

    expect(result[0]!.expression).toStrictEqual({
      type: "barDuration",
      bars: 1,
    });
  });

  it("parses a multi-bar count (4bar)", () => {
    const result = parseAssignments("duration = 4bar");

    expect(result[0]!.expression).toStrictEqual({
      type: "barDuration",
      bars: 4,
    });
  });

  it("parses Nbar with the += operator", () => {
    const result = parseAssignments("timing += 1bar");

    expect(result[0]!.operator).toBe("add");
    expect(result[0]!.expression).toStrictEqual({
      type: "barDuration",
      bars: 1,
    });
  });

  // The mixed `Nbar+n<frac>` form composes through ordinary addition rather than
  // a single token, matching the authoring grammar's value while reusing the
  // expression machinery.
  it("parses 1bar+n/4 as add(barDuration, nDuration)", () => {
    const result = parseAssignments("duration = 1bar+n/4");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: { type: "barDuration", bars: 1 },
      right: { type: "nDuration", wholeNoteFraction: 0.25 },
    });
  });

  it("parses 1bar-n/16 as subtract(barDuration, nDuration)", () => {
    // The minus tail needs no dedicated rule here: `additive` already folds
    // `-`, so a near-bar duration composes as barDuration - nDuration. This
    // locks parity with the barbeat grammar's minus-tail support.
    const result = parseAssignments("duration = 1bar-n/16");

    expect(result[0]!.expression).toStrictEqual({
      type: "subtract",
      left: { type: "barDuration", bars: 1 },
      right: { type: "nDuration", wholeNoteFraction: 0.0625 },
    });
  });

  it("composes in a multiplicative expression", () => {
    const result = parseAssignments("duration = 2 * 1bar");

    expect(result[0]!.expression).toStrictEqual({
      type: "multiply",
      left: 2,
      right: { type: "barDuration", bars: 1 },
    });
  });

  it("composes inside parentheses", () => {
    const result = parseAssignments("duration = (1bar + n/8) / 2");

    expect(result[0]!.expression).toStrictEqual({
      type: "divide",
      left: {
        type: "add",
        left: { type: "barDuration", bars: 1 },
        right: { type: "nDuration", wholeNoteFraction: 0.125 },
      },
      right: 2,
    });
  });

  describe("bare shorthand", () => {
    it("desugars bare 1bar to duration set (parallel to bare n/4)", () => {
      expect(parseAssignments("1bar")).toStrictEqual(
        parseAssignments("duration = 1bar"),
      );
    });

    // The mixed `Nbar+n<frac>` token works as a bare shorthand too, matching the
    // bar|beat authoring grammar. It must desugar identically to the full form.
    it("desugars bare 1bar+n/4 identically to the full duration assignment", () => {
      expect(parseAssignments("1bar+n/4")).toStrictEqual(
        parseAssignments("duration = 1bar+n/4"),
      );
    });

    it("parses bare 2bar+n3/8 as add(barDuration, nDuration)", () => {
      const result = parseAssignments("2bar+n3/8");

      expect(result[0]!.parameter).toBe("duration");
      expect(result[0]!.operator).toBe("set");
      expect(result[0]!.expression).toStrictEqual({
        type: "add",
        left: { type: "barDuration", bars: 2 },
        right: { type: "nDuration", wholeNoteFraction: 0.375 },
      });
    });

    // The minus tail works as a bare shorthand too — it desugars to a subtract
    // node, identical to the full `duration = 1bar-n/16` form.
    it("desugars bare 1bar-n/16 to subtract(barDuration, nDuration)", () => {
      expect(parseAssignments("1bar-n/16")).toStrictEqual(
        parseAssignments("duration = 1bar-n/16"),
      );

      expect(parseAssignments("1bar-n/16")[0]!.expression).toStrictEqual({
        type: "subtract",
        left: { type: "barDuration", bars: 1 },
        right: { type: "nDuration", wholeNoteFraction: 0.0625 },
      });
    });

    it("inherits the denominator error for a bare 1bar+n2.5", () => {
      expect(() => parseAssignments("1bar+n2.5")).toThrow(
        /needs? a denominator/,
      );
    });
  });
});
