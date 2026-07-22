// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseAssignments } from "./parse-test-helpers.ts";

describe("Transform Parser - nDuration", () => {
  it("parses n<fraction> with explicit numerator", () => {
    const result = parseAssignments("duration = n1/4");

    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 0.25,
    });
  });

  it("parses n/<denominator> with implicit numerator of 1", () => {
    const result = parseAssignments("duration = n/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 0.125,
    });
  });

  it("parses dotted-quarter n3/8", () => {
    const result = parseAssignments("duration = n3/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 0.375,
    });
  });

  it("parses triplet n/12", () => {
    const result = parseAssignments("duration = n/12");

    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 1 / 12,
    });
  });

  it("parses dotted (`d`, ×3/2) and triplet (`t`, ×2/3) suffixes", () => {
    // n/4d = dotted quarter = 3/8; n/8t = eighth triplet = 1/12. The suffix scales
    // any numerator (n3/8d = 9/16), matching the bar|beat grammar.
    for (const [token, frac] of [
      ["n/4d", 3 / 8],
      ["n/4t", 1 / 6],
      ["n/8t", 1 / 12],
      ["n3/8d", 9 / 16],
    ] as const) {
      expect(
        parseAssignments(`duration = ${token}`)[0]!.expression,
      ).toStrictEqual({ type: "nDuration", wholeNoteFraction: frac });
    }
  });

  it("parses a triplet suffix inside a waveform period (n/8t)", () => {
    // The suffix flows everywhere the note-value fraction does, including a
    // `sin(period)` cycle length. `n/4t` is a valid note value, not the removed
    // `Nt` period syntax (which is a bare number + t).
    const result = parseAssignments("velocity += cos(n/8t)");

    expect(
      (result[0]!.expression as { args: unknown[] }).args[0],
    ).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 1 / 12,
    });
  });

  it("rejects stacked/doubled note-value suffixes", () => {
    for (const bad of ["n/4dt", "n/4dd", "n/4td", "n/4tt"]) {
      expect(() => parseAssignments(`duration = ${bad}`)).toThrow();
    }
  });

  it("parses nDuration in additive expression", () => {
    const result = parseAssignments("duration = n/4 + n/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: { type: "nDuration", wholeNoteFraction: 0.25 },
      right: { type: "nDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses nDuration in multiplicative expression", () => {
    const result = parseAssignments("duration = 2 * n/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "multiply",
      left: 2,
      right: { type: "nDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses nDuration with += operator", () => {
    const result = parseAssignments("timing += n/16");

    expect(result[0]!.operator).toBe("add");
    expect(result[0]!.expression).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 0.0625,
    });
  });

  it("parses nDuration mixed with variable", () => {
    const result = parseAssignments("duration = note.duration + n/8");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: { type: "variable", namespace: "note", name: "duration" },
      right: { type: "nDuration", wholeNoteFraction: 0.125 },
    });
  });

  it("parses nDuration inside parentheses", () => {
    const result = parseAssignments("duration = (n/4 + n/8) * 2");

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
    expect(() => parseAssignments("duration = n4")).toThrow(/denominator/);
  });

  it("throws on bare decimal after n (missing denominator)", () => {
    expect(() => parseAssignments("duration = n0.5")).toThrow(/denominator/);
  });

  it("throws on mixed-number after n (missing denominator)", () => {
    expect(() => parseAssignments("duration = n1+1/4")).toThrow(/denominator/);
  });

  // Malformed denominators must error, never silently produce garbage. The
  // grammar requires a denominator starting [1-9]; numerator is [0-9]*.
  it("throws on zero denominator (n/0)", () => {
    expect(() => parseAssignments("duration = n/0")).toThrow();
  });

  it("throws on double slash (n//4)", () => {
    expect(() => parseAssignments("duration = n//4")).toThrow();
  });

  it("throws on a numerator with zero denominator (n3/0)", () => {
    expect(() => parseAssignments("duration = n3/0")).toThrow(/denominator/);
  });

  it("parses a large numerator without overflow (n999999/4)", () => {
    expect(
      parseAssignments("duration = n999999/4")[0]!.expression,
    ).toStrictEqual({
      type: "nDuration",
      wholeNoteFraction: 999999 / 4,
    });
  });
});
