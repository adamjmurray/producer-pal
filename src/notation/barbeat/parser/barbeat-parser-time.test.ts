// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser.ts";

describe("BarBeatScript Parser - time declarations", () => {
  it("parses integer and floating point beats", () => {
    expect(parser.parse("1|1 C3 1|1.5 D3 1|2.25 E3")).toStrictEqual([
      { bar: 1, beat: 1 },
      { pitch: 60 },
      { bar: 1, beat: 1.5 },
      { pitch: 62 },
      { bar: 1, beat: 2.25 },
      { pitch: 64 },
    ]);
  });

  it("parses fractional beats", () => {
    expect(parser.parse("1|4/3 C3 1|5/3 D3 1|7/3 E3")).toStrictEqual([
      { bar: 1, beat: 4 / 3 },
      { pitch: 60 },
      { bar: 1, beat: 5 / 3 },
      { pitch: 62 },
      { bar: 1, beat: 7 / 3 },
      { pitch: 64 },
    ]);
  });

  it("parses mixed decimal and fractional beats", () => {
    expect(parser.parse("1|1 C3 1|4/3 D3 1|1.5 E3 1|5/3 F3")).toStrictEqual([
      { bar: 1, beat: 1 },
      { pitch: 60 },
      { bar: 1, beat: 4 / 3 },
      { pitch: 62 },
      { bar: 1, beat: 1.5 },
      { pitch: 64 },
      { bar: 1, beat: 5 / 3 },
      { pitch: 65 },
    ]);
  });

  it("parses beats with + operator (integer + fraction)", () => {
    expect(parser.parse("1|2+1/3 C3 1|2+3/4 D3")).toStrictEqual([
      { bar: 1, beat: 2 + 1 / 3 },
      { pitch: 60 },
      { bar: 1, beat: 2 + 3 / 4 },
      { pitch: 62 },
    ]);
  });

  it("parses beat lists with + operator", () => {
    expect(parser.parse("1|1,2+1/4,2+1/2,2+3/4")).toStrictEqual([
      { bar: 1, beat: 1 },
      { bar: 1, beat: 2 + 1 / 4 },
      { bar: 1, beat: 2 + 1 / 2 },
      { bar: 1, beat: 2 + 3 / 4 },
    ]);
  });

  it("parses repeat pattern with whole step", () => {
    expect(parser.parse("1|1x4@1")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: 1 } },
    ]);
  });

  it("parses repeat pattern with fractional step", () => {
    expect(parser.parse("1|1x3@1/3")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 3, step: 1 / 3 } },
    ]);
  });

  it("parses repeat pattern with fractional step (optional numerator)", () => {
    expect(parser.parse("1|1x3@/3")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 3, step: 1 / 3 } },
    ]);
    expect(parser.parse("1|1x4@/4")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: 1 / 4 } },
    ]);
  });

  it("parses repeat pattern with decimal step", () => {
    expect(parser.parse("1|3x4@0.25")).toStrictEqual([
      { bar: 1, beat: { start: 3, times: 4, step: 0.25 } },
    ]);
  });

  it("parses repeat pattern with mixed number step", () => {
    expect(parser.parse("1|1x4@1+1/2")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: 1.5 } },
    ]);
  });

  it("parses repeat pattern with mixed number start", () => {
    expect(parser.parse("1|2+1/3x3@1/3")).toStrictEqual([
      { bar: 1, beat: { start: 2 + 1 / 3, times: 3, step: 1 / 3 } },
    ]);
  });

  it("parses repeat pattern without bar (uses current bar)", () => {
    expect(parser.parse("|1x4@1")).toStrictEqual([
      { bar: null, beat: { start: 1, times: 4, step: 1 } },
    ]);
  });

  it("parses repeat pattern without step (defaults to null)", () => {
    expect(parser.parse("1|1x4")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: null } },
    ]);
  });

  it("parses repeat pattern mixed with regular beats", () => {
    expect(parser.parse("1|1x4@1,3.5")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: 1 } },
      { bar: 1, beat: 3.5 },
    ]);
  });

  it("parses multiple repeat patterns in beat list", () => {
    expect(parser.parse("1|1x2@1,3x2@0.5")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 2, step: 1 } },
      { bar: 1, beat: { start: 3, times: 2, step: 0.5 } },
    ]);
  });

  it("rejects repeat pattern with step=0", () => {
    expect(() => parser.parse("1|1x4@0")).toThrow(
      "Repeat step size must be greater than 0",
    );
  });

  it("rejects fractional beats less than 1", () => {
    expect(() => parser.parse("1|1/2 C3")).toThrow(
      "Beat position must be 1 or greater (got 1/2)",
    );
    expect(() => parser.parse("1|2/3 C3")).toThrow(
      "Beat position must be 1 or greater (got 2/3)",
    );
    expect(() => parser.parse("1|3/4 C3")).toThrow(
      "Beat position must be 1 or greater (got 3/4)",
    );
  });
});
