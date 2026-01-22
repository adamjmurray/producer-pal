import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser-wrapper.ts";

describe("BarBeatScript Parser - duration", () => {
  it("parses floating-point durations", () => {
    expect(parser.parse("t0.25 C3 t1.0 D3")).toStrictEqual([
      { duration: 0.25 },
      { pitch: 60 },
      { duration: 1.0 },
      { pitch: 62 },
    ]);
  });

  it("parses fractional durations", () => {
    expect(parser.parse("t1/3 C3 t2/3 D3 t4/3 E3")).toStrictEqual([
      { duration: 1 / 3 },
      { pitch: 60 },
      { duration: 2 / 3 },
      { pitch: 62 },
      { duration: 4 / 3 },
      { pitch: 64 },
    ]);
  });

  it("parses mixed decimal and fractional durations", () => {
    expect(parser.parse("t0.5 C3 t1/2 D3 t1.5 E3 t3/2 F3")).toStrictEqual([
      { duration: 0.5 },
      { pitch: 60 },
      { duration: 1 / 2 },
      { pitch: 62 },
      { duration: 1.5 },
      { pitch: 64 },
      { duration: 3 / 2 },
      { pitch: 65 },
    ]);
  });

  it("parses quintuplet durations", () => {
    expect(parser.parse("t1/5 C3 t2/5 D3")).toStrictEqual([
      { duration: 1 / 5 },
      { pitch: 60 },
      { duration: 2 / 5 },
      { pitch: 62 },
    ]);
  });

  it("parses zero duration with fraction notation", () => {
    expect(parser.parse("t0/1 C3")).toStrictEqual([
      { duration: 0 },
      { pitch: 60 },
    ]);
  });

  it("parses fractional duration with optional numerator (defaults to 1)", () => {
    expect(parser.parse("t/4 C3")).toStrictEqual([
      { duration: 1 / 4 },
      { pitch: 60 },
    ]);
    expect(parser.parse("t/8 C3")).toStrictEqual([
      { duration: 1 / 8 },
      { pitch: 60 },
    ]);
    expect(parser.parse("t/3 C3")).toStrictEqual([
      { duration: 1 / 3 },
      { pitch: 60 },
    ]);
  });

  it("parses bar:beat duration format (NEW)", () => {
    expect(parser.parse("t2:1.5 C3")).toStrictEqual([
      { duration: "2:1.5" },
      { pitch: 60 },
    ]);
    expect(parser.parse("t1:0 C3")).toStrictEqual([
      { duration: "1:0" },
      { pitch: 60 },
    ]);
    expect(parser.parse("t0:2 C3")).toStrictEqual([
      { duration: "0:2" },
      { pitch: 60 },
    ]);
  });

  it("parses bar:beat duration with fractions (NEW)", () => {
    expect(parser.parse("t1:3/4 C3")).toStrictEqual([
      { duration: "1:0.75" },
      { pitch: 60 },
    ]);
    expect(parser.parse("t2:1/3 C3")).toStrictEqual([
      { duration: `2:${1 / 3}` },
      { pitch: 60 },
    ]);
  });

  it("parses bar:beat duration with fractions (optional numerator)", () => {
    expect(parser.parse("t1:/4 C3")).toStrictEqual([
      { duration: "1:0.25" },
      { pitch: 60 },
    ]);
    expect(parser.parse("t0:/3 C3")).toStrictEqual([
      { duration: `0:${1 / 3}` },
      { pitch: 60 },
    ]);
  });

  it("parses bar:beat duration with + operator", () => {
    expect(parser.parse("t1:2+1/3 C3")).toStrictEqual([
      { duration: `1:${2 + 1 / 3}` },
      { pitch: 60 },
    ]);
    expect(parser.parse("t0:3+3/4 C3")).toStrictEqual([
      { duration: `0:${3 + 3 / 4}` },
      { pitch: 60 },
    ]);
  });

  it("parses beat-only duration with + operator", () => {
    expect(parser.parse("t2+3/4 C3")).toStrictEqual([
      { duration: 2 + 3 / 4 },
      { pitch: 60 },
    ]);
    expect(parser.parse("t1+1/2 C3")).toStrictEqual([
      { duration: 1 + 1 / 2 },
      { pitch: 60 },
    ]);
  });

  it("distinguishes between beat-only and bar:beat formats", () => {
    // Beat-only: number
    expect(parser.parse("t2.5 C3")).toStrictEqual([
      { duration: 2.5 },
      { pitch: 60 },
    ]);
    // Bar:beat: string
    expect(parser.parse("t2:0.5 C3")).toStrictEqual([
      { duration: "2:0.5" },
      { pitch: 60 },
    ]);
  });
});
