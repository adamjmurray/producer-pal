// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

describe("BarBeatScript Parser - duration", () => {
  it("parses fractional durations (numerator + denominator)", () => {
    expect(parser.parse("t1/4 C3 t3/8 D3 t5/4 E3")).toStrictEqual([
      { duration: 1 / 4 },
      { pitch: 60 },
      { duration: 3 / 8 },
      { pitch: 62 },
      { duration: 5 / 4 },
      { pitch: 64 },
    ]);
  });

  it("parses fractional duration with optional numerator (defaults to 1)", () => {
    expect(parser.parse("t/4 C3 t/8 D3 t/16 E3")).toStrictEqual([
      { duration: 1 / 4 },
      { pitch: 60 },
      { duration: 1 / 8 },
      { pitch: 62 },
      { duration: 1 / 16 },
      { pitch: 64 },
    ]);
  });

  it("parses triplet/tuplet denominators", () => {
    expect(parser.parse("t/3 C3 t/6 D3 t/12 E3 t/20 F3")).toStrictEqual([
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

  it("parses zero numerator", () => {
    expect(parser.parse("t0/1 C3")).toStrictEqual([
      { duration: 0 },
      { pitch: 60 },
    ]);
  });

  it("parses whole-note family", () => {
    expect(parser.parse("t/1 C3 t/2 D3 t/4 E3 t/8 F3 t/16 G3")).toStrictEqual([
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

  it("rejects bare-integer durations with denominator-required error", () => {
    expect(() => parser.parse("t1 C3")).toThrow(
      /durations need a denominator.*Got t1/,
    );
    expect(() => parser.parse("t4 C3")).toThrow(
      /durations need a denominator.*Got t4/,
    );
  });

  it("rejects decimal durations with denominator-required error", () => {
    expect(() => parser.parse("t0.5 C3")).toThrow(
      /durations need a denominator.*Got t0\.5/,
    );
    expect(() => parser.parse("t2.5 C3")).toThrow(
      /durations need a denominator.*Got t2\.5/,
    );
    expect(() => parser.parse("t.25 C3")).toThrow(
      /durations need a denominator.*Got t\.25/,
    );
  });

  it("rejects mixed-number durations with denominator-required error", () => {
    expect(() => parser.parse("t1+1/2 C3")).toThrow(
      /durations need a denominator.*Got t1\+1\/2/,
    );
  });

  it("rejects bar:beat duration form", () => {
    expect(() => parser.parse("t2:1.5 C3")).toThrow();
    expect(() => parser.parse("t1:0 C3")).toThrow();
  });
});
