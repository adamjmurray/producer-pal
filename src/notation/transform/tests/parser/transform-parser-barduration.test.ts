// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - barDuration (Nbar)", () => {
  it("parses 1bar as a barDuration node", () => {
    const result = parser.parse("duration = 1bar");

    expect(result[0]!.expression).toStrictEqual({
      type: "barDuration",
      bars: 1,
    });
  });

  it("parses a multi-bar count (4bar)", () => {
    const result = parser.parse("duration = 4bar");

    expect(result[0]!.expression).toStrictEqual({
      type: "barDuration",
      bars: 4,
    });
  });

  it("parses Nbar with the += operator", () => {
    const result = parser.parse("timing += 1bar");

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
    const result = parser.parse("duration = 1bar+n/4");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: { type: "barDuration", bars: 1 },
      right: { type: "nDuration", wholeNoteFraction: 0.25 },
    });
  });

  it("composes in a multiplicative expression", () => {
    const result = parser.parse("duration = 2 * 1bar");

    expect(result[0]!.expression).toStrictEqual({
      type: "multiply",
      left: 2,
      right: { type: "barDuration", bars: 1 },
    });
  });

  it("composes inside parentheses", () => {
    const result = parser.parse("duration = (1bar + n/8) / 2");

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
      expect(parser.parse("1bar")).toStrictEqual(
        parser.parse("duration = 1bar"),
      );
    });
  });
});
