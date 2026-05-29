// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - nDuration", () => {
  it("parses t<fraction> with explicit numerator", () => {
    const result = parser.parse("duration = n1/4");

    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 0.25,
    });
  });

  it("parses n/<denominator> with implicit numerator of 1", () => {
    const result = parser.parse("duration = n/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 0.125,
    });
  });

  it("parses dotted-quarter n3/8", () => {
    const result = parser.parse("duration = n3/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 0.375,
    });
  });

  it("parses triplet n/12", () => {
    const result = parser.parse("duration = n/12");

    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 1 / 12,
    });
  });

  it("parses nDuration in additive expression", () => {
    const result = parser.parse("duration = n/4 + n/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: { type: "nDuration", wholeNoteFraction: 0.25 },
      right: { type: "nDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses nDuration in multiplicative expression", () => {
    const result = parser.parse("duration = 2 * n/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "multiply",
      left: 2,
      right: { type: "nDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses nDuration with += operator", () => {
    const result = parser.parse("timing += n/16");

    expect(result[0]!.operator).toBe("add");
    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 0.0625,
    });
  });

  it("parses nDuration mixed with variable", () => {
    const result = parser.parse("duration = note.duration + n/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: { type: "variable", namespace: "note", name: "duration" },
      right: { type: "nDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses nDuration inside parentheses", () => {
    const result = parser.parse("duration = (n/4 + n/8) * 2");

    expect(result[0]!.expression).toStrictEqual({
      type: "multiply",
      left: {
        type: "add",
        left: { type: "nDuration", wholeNoteFraction: 0.25 },
        right: { type: "nDuration", wholeNoteFraction: 0.125 },
      },
      right: 2,
    });
  });

  it("throws on bare integer after n (missing denominator)", () => {
    expect(() => parser.parse("duration = n4")).toThrow(/denominator/);
  });

  it("throws on bare decimal after n (missing denominator)", () => {
    expect(() => parser.parse("duration = n0.5")).toThrow(/denominator/);
  });

  it("throws on mixed-number after n (missing denominator)", () => {
    expect(() => parser.parse("duration = n1+1/4")).toThrow(/denominator/);
  });
});
