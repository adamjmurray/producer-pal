// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - tDuration", () => {
  it("parses t<fraction> with explicit numerator", () => {
    const result = parser.parse("duration = t1/4");

    expect(result[0]!.expression).toStrictEqual({
      type: "tDuration",
      wholeNoteFraction: 0.25,
    });
  });

  it("parses t/<denominator> with implicit numerator of 1", () => {
    const result = parser.parse("duration = t/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "tDuration",
      wholeNoteFraction: 0.125,
    });
  });

  it("parses dotted-quarter t3/8", () => {
    const result = parser.parse("duration = t3/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "tDuration",
      wholeNoteFraction: 0.375,
    });
  });

  it("parses triplet t/12", () => {
    const result = parser.parse("duration = t/12");

    expect(result[0]!.expression).toStrictEqual({
      type: "tDuration",
      wholeNoteFraction: 1 / 12,
    });
  });

  it("parses tDuration in additive expression", () => {
    const result = parser.parse("duration = t/4 + t/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: { type: "tDuration", wholeNoteFraction: 0.25 },
      right: { type: "tDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses tDuration in multiplicative expression", () => {
    const result = parser.parse("duration = 2 * t/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "multiply",
      left: 2,
      right: { type: "tDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses tDuration with += operator", () => {
    const result = parser.parse("timing += t/16");

    expect(result[0]!.operator).toBe("add");
    expect(result[0]!.expression).toStrictEqual({
      type: "tDuration",
      wholeNoteFraction: 0.0625,
    });
  });

  it("parses tDuration mixed with variable", () => {
    const result = parser.parse("duration = note.duration + t/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: { type: "variable", namespace: "note", name: "duration" },
      right: { type: "tDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses tDuration inside parentheses", () => {
    const result = parser.parse("duration = (t/4 + t/8) * 2");

    expect(result[0]!.expression).toStrictEqual({
      type: "multiply",
      left: {
        type: "add",
        left: { type: "tDuration", wholeNoteFraction: 0.25 },
        right: { type: "tDuration", wholeNoteFraction: 0.125 },
      },
      right: 2,
    });
  });

  it("throws on bare integer after t (missing denominator)", () => {
    expect(() => parser.parse("duration = t4")).toThrow(/denominator/);
  });

  it("throws on bare decimal after t (missing denominator)", () => {
    expect(() => parser.parse("duration = t0.5")).toThrow(/denominator/);
  });

  it("throws on mixed-number after t (missing denominator)", () => {
    expect(() => parser.parse("duration = t1+1/4")).toThrow(/denominator/);
  });
});
