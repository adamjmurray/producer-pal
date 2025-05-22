// src/bar-beat-script/parser.test.js
import { describe, expect, it } from "vitest";
import * as parser from "./bbs-parser";

describe("BarBeatScript Parser", () => {
  it("parses notes with bar.beat.unit start time notation", () => {
    expect(parser.parse("1.1.0:C3, 3.2.0:D3, 5.3.240:E3")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1, unit: 0 },
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 3, beat: 2, unit: 0 },
      },
      {
        name: "E3",
        pitch: 64,
        start: { bar: 5, beat: 3, unit: 240 },
      },
    ]);
  });

  it("parses notes with bar.beat start time notation", () => {
    expect(parser.parse("1.1:C3, 3.2:D3, 5.3:E3")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1, unit: 0 },
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 3, beat: 2, unit: 0 },
      },
      {
        name: "E3",
        pitch: 64,
        start: { bar: 5, beat: 3, unit: 0 },
      },
    ]);
  });

  it("allows trailing commas", () => {
    expect(parser.parse("1.1:C3, 3.2:D3  , ")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1, unit: 0 },
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 3, beat: 2, unit: 0 },
      },
    ]);
  });

  it("parses notes with bar.beat.unit start time notation with out of order start times and extra whitespace", () => {
    expect(
      parser.parse(`     5.3.240   :   E3,
1.1.0:C3  ,   3.2 :D3`)
    ).toStrictEqual([
      {
        name: "E3",
        pitch: 64,
        start: { bar: 5, beat: 3, unit: 240 },
      },
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1, unit: 0 },
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 3, beat: 2, unit: 0 },
      },
    ]);
  });

  it("parses notes with modifiers", () => {
    const ast = parser.parse("1.1.0:C3v80t2");
    expect(ast).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1, unit: 0 },
        velocity: 80,
        duration: 2,
      },
    ]);
  });

  it("supports note modifiers in any order", () => {
    const ast = parser.parse("1.1.0:C3t2v80");
    expect(ast).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1, unit: 0 },
        velocity: 80,
        duration: 2,
      },
    ]);
  });

  it("supports multiple notes with for a single start time", () => {
    const ast = parser.parse("4.3.360:C3 E3 G3");
    expect(ast).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 4, beat: 3, unit: 360 },
      },
      {
        name: "E3",
        pitch: 64,
        start: { bar: 4, beat: 3, unit: 360 },
      },
      {
        name: "G3",
        pitch: 67,
        start: { bar: 4, beat: 3, unit: 360 },
      },
    ]);
  });

  it("supports multiple notes with for a single start time, multiple times", () => {
    const ast = parser.parse("1.1.0:C3 E3 G3, 2.3.120: D3 F3 A3");
    expect(ast).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1, unit: 0 },
      },
      {
        name: "E3",
        pitch: 64,
        start: { bar: 1, beat: 1, unit: 0 },
      },
      {
        name: "G3",
        pitch: 67,
        start: { bar: 1, beat: 1, unit: 0 },
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 2, beat: 3, unit: 120 },
      },
      {
        name: "F3",
        pitch: 65,
        start: { bar: 2, beat: 3, unit: 120 },
      },
      {
        name: "A3",
        pitch: 69,
        start: { bar: 2, beat: 3, unit: 120 },
      },
    ]);
  });

  it("throws error for invalid syntax", () => {
    expect(() => parser.parse("C3")).toThrow(); // Missing start time
    expect(() => parser.parse("1.1.0 C3")).toThrow(); // Missing colon
    expect(() => parser.parse("0:C3")).toThrow(); // Missing bar.beat.unit format
  });

  it("throws error for duplicate modifiers", () => {
    expect(() => parser.parse("1.1.0:C3v80v90")).toThrow(/Duplicate modifier/);
    expect(() => parser.parse("1.1.0:C3t2t3")).toThrow(/Duplicate modifier/);
  });
});
