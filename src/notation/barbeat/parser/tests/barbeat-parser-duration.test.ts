// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

describe("BarBeatScript Parser - duration", () => {
  it("parses fractional durations (numerator + denominator)", () => {
    expect(parser.parse("n1/4 C3 n3/8 D3 n5/4 E3")).toStrictEqual([
      { duration: 1 / 4 },
      { pitch: 60 },
      { duration: 3 / 8 },
      { pitch: 62 },
      { duration: 5 / 4 },
      { pitch: 64 },
    ]);
  });

  it("parses fractional duration with optional numerator (defaults to 1)", () => {
    expect(parser.parse("n/4 C3 n/8 D3 n/16 E3")).toStrictEqual([
      { duration: 1 / 4 },
      { pitch: 60 },
      { duration: 1 / 8 },
      { pitch: 62 },
      { duration: 1 / 16 },
      { pitch: 64 },
    ]);
  });

  it("parses triplet/tuplet denominators", () => {
    expect(parser.parse("n/3 C3 n/6 D3 n/12 E3 n/20 F3")).toStrictEqual([
      { duration: 1 / 3 },
      { pitch: 60 },
      { duration: 1 / 6 },
      { pitch: 62 },
      { duration: 1 / 12 },
      { pitch: 64 },
      { duration: 1 / 20 },
      { pitch: 65 },
    ]);
  });

  it("parses dotted (`d`, ×3/2) and triplet (`t`, ×2/3) suffixes", () => {
    // `d` scales the note value by 3/2, `t` by 2/3. n/4d = dotted quarter = 3/8;
    // n/4t = quarter triplet = 1/6; n/8t = eighth triplet = 1/12.
    expect(parser.parse("n/4d C3 n/4t D3 n/8t E3")).toStrictEqual([
      { duration: 3 / 8 },
      { pitch: 60 },
      { duration: 1 / 6 },
      { pitch: 62 },
      { duration: 1 / 12 },
      { pitch: 64 },
    ]);
  });

  it("applies d/t suffix to any numerator (not just implicit 1)", () => {
    // The suffix is a pure post-multiply on the fraction value: n3/8d = 9/16,
    // n3/8t = 1/4, n5/16t = 5/24.
    expect(parser.parse("n3/8d C3 n3/8t D3 n5/16t E3")).toStrictEqual([
      { duration: 9 / 16 },
      { pitch: 60 },
      { duration: 1 / 4 },
      { pitch: 62 },
      { duration: 5 / 24 },
      { pitch: 64 },
    ]);
  });

  it("rejects stacked/doubled note-value suffixes (mutually exclusive)", () => {
    // `("d"/"t")?` matches at most one suffix; a doubled or mixed suffix leaves a
    // stray letter that the element separator can't consume.
    for (const bad of ["n/4dt C3", "n/4dd C3", "n/4td C3", "n/4tt C3"]) {
      expect(() => parser.parse(bad)).toThrow();
    }
  });

  it("parses zero numerator", () => {
    expect(parser.parse("n0/1 C3")).toStrictEqual([
      { duration: 0 },
      { pitch: 60 },
    ]);
  });

  it("parses whole-note family", () => {
    expect(parser.parse("n/1 C3 n/2 D3 n/4 E3 n/8 F3 n/16 G3")).toStrictEqual([
      { duration: 1 },
      { pitch: 60 },
      { duration: 1 / 2 },
      { pitch: 62 },
      { duration: 1 / 4 },
      { pitch: 64 },
      { duration: 1 / 8 },
      { pitch: 65 },
      { duration: 1 / 16 },
      { pitch: 67 },
    ]);
  });

  it("parses inline bar durations (Nbar, meter-aware)", () => {
    expect(parser.parse("1bar C3 2bar D3")).toStrictEqual([
      { bars: 1, duration: 0 },
      { pitch: 60 },
      { bars: 2, duration: 0 },
      { pitch: 62 },
    ]);
  });

  it("parses inline mixed bar+note-value durations (Nbar+nA/B)", () => {
    expect(parser.parse("1bar+n3/4 C3 2bar+n/8 D3")).toStrictEqual([
      { bars: 1, duration: 3 / 4 },
      { pitch: 60 },
      { bars: 2, duration: 1 / 8 },
      { pitch: 62 },
    ]);
  });

  it("parses minus-tail bar durations (Nbar-nA/B, almost a full bar)", () => {
    // The tail sign subtracts the note value, so the stored `duration` fraction
    // is negative; the interpreter resolves `1bar-n/16` to "a bar minus a 16th".
    expect(parser.parse("1bar-n/16 C3 2bar-n3/8 D3")).toStrictEqual([
      { bars: 1, duration: -1 / 16 },
      { pitch: 60 },
      { bars: 2, duration: -3 / 8 },
      { pitch: 62 },
    ]);
  });

  it("rejects the n-prefixed bar form with a targeted Nbar steer", () => {
    // `n1bar`/`n/1bar`/`n3/4bar` are a convergent model hallucination — bars are
    // the bare `Nbar` form, the `n` sigil is only for note-value fractions.
    for (const bad of ["n1bar C3", "n/1bar C3", "n3/4bar C3"]) {
      expect(() => parser.parse(bad)).toThrow(
        /bar durations don't use the "n" prefix/,
      );
    }

    // The suggested correction echoes the bar count.
    expect(() => parser.parse("n2bar C3")).toThrow(
      /write Nbar \(e\.g\. 2bar\)/,
    );
  });

  it("rejects bare-integer durations with denominator-required error", () => {
    expect(() => parser.parse("n1 C3")).toThrow(
      /durations need a denominator.*Got n1/,
    );
    expect(() => parser.parse("n4 C3")).toThrow(
      /durations need a denominator.*Got n4/,
    );
  });

  it("rejects decimal durations with denominator-required error", () => {
    expect(() => parser.parse("n0.5 C3")).toThrow(
      /durations need a denominator.*Got n0\.5/,
    );
    expect(() => parser.parse("n2.5 C3")).toThrow(
      /durations need a denominator.*Got n2\.5/,
    );
    expect(() => parser.parse("n.25 C3")).toThrow(
      /durations need a denominator.*Got n\.25/,
    );
  });

  it("rejects mixed-number durations with denominator-required error", () => {
    expect(() => parser.parse("n1+1/2 C3")).toThrow(
      /durations need a denominator.*Got n1\+1\/2/,
    );
  });

  it("rejects bar:beat duration form", () => {
    expect(() => parser.parse("n2:1.5 C3")).toThrow();
    expect(() => parser.parse("n1:0 C3")).toThrow();
  });

  it("rejects malformed denominators (zero or missing)", () => {
    expect(() => parser.parse("n/0 C3")).toThrow();
    expect(() => parser.parse("n//4 C3")).toThrow();
    expect(() => parser.parse("n3/0 C3")).toThrow(/denominator/);
  });
});
