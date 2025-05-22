// src/notation/barbeat/barbeat-parser.test.js
import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser";

describe("BarBeatScript Parser", () => {
  it("parses notes with implicit defaults", () => {
    expect(parser.parse("C3 E3 G3")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1 },
        velocity: 70,
        duration: 1.0,
      },
      {
        name: "E3",
        pitch: 64,
        start: { bar: 1, beat: 1 },
        velocity: 70,
        duration: 1.0,
      },
      {
        name: "G3",
        pitch: 67,
        start: { bar: 1, beat: 1 },
        velocity: 70,
        duration: 1.0,
      },
    ]);
  });

  it("parses time declarations", () => {
    expect(parser.parse("1:1 C3\n2:3 D3")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1 },
        velocity: 70,
        duration: 1.0,
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 2, beat: 3 },
        velocity: 70,
        duration: 1.0,
      },
    ]);
  });

  it("parses floating point beats", () => {
    expect(parser.parse("1:1.5 C3\n1:2.25 D3")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1.5 },
        velocity: 70,
        duration: 1.0,
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 1, beat: 2.25 },
        velocity: 70,
        duration: 1.0,
      },
    ]);
  });

  it("maintains state across declarations", () => {
    expect(parser.parse("1:1 v100 t2.0 C3\nD3\n2:1 E3")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1 },
        velocity: 100,
        duration: 2.0,
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 1, beat: 1 },
        velocity: 100,
        duration: 2.0,
      },
      {
        name: "E3",
        pitch: 64,
        start: { bar: 2, beat: 1 },
        velocity: 100,
        duration: 2.0,
      },
    ]);
  });

  it("handles standalone state changes", () => {
    expect(parser.parse("v90\nt0.5\n1:2 C3 D3")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 2 },
        velocity: 90,
        duration: 0.5,
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 1, beat: 2 },
        velocity: 90,
        duration: 0.5,
      },
    ]);
  });

  it("handles complex stateful parsing", () => {
    const input = `
      1:1 v100 t1.0 C3
      1:2 D3
      1:3 E3
      1:4 F3
      2:1 v80 t2.0 G3
    `;

    expect(parser.parse(input)).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1 },
        velocity: 100,
        duration: 1.0,
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 1, beat: 2 },
        velocity: 100,
        duration: 1.0,
      },
      {
        name: "E3",
        pitch: 64,
        start: { bar: 1, beat: 3 },
        velocity: 100,
        duration: 1.0,
      },
      {
        name: "F3",
        pitch: 65,
        start: { bar: 1, beat: 4 },
        velocity: 100,
        duration: 1.0,
      },
      {
        name: "G3",
        pitch: 67,
        start: { bar: 2, beat: 1 },
        velocity: 80,
        duration: 2.0,
      },
    ]);
  });

  it("handles drum pattern example from spec", () => {
    const input = `
      1:1 v100 t0.25 C1 Gb1
      1:1.5 v60 Gb1
      1:2 v90 D1
      v100 Gb1
    `;

    const result = parser.parse(input);

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({
      name: "C1",
      pitch: 36,
      start: { bar: 1, beat: 1 },
      velocity: 100,
      duration: 0.25,
    });
    expect(result[1]).toEqual({
      name: "Gb1",
      pitch: 42,
      start: { bar: 1, beat: 1 },
      velocity: 100,
      duration: 0.25,
    });
    expect(result[2]).toEqual({
      name: "Gb1",
      pitch: 42,
      start: { bar: 1, beat: 1.5 },
      velocity: 60,
      duration: 0.25,
    });
    expect(result[3]).toEqual({
      name: "D1",
      pitch: 38,
      start: { bar: 1, beat: 2 },
      velocity: 90,
      duration: 0.25,
    });
    expect(result[4]).toEqual({
      name: "Gb1",
      pitch: 42,
      start: { bar: 1, beat: 2 },
      velocity: 100,
      duration: 0.25,
    });
  });

  it("throws error for invalid velocity", () => {
    expect(() => parser.parse("v128 C3")).toThrow(/Velocity out of range/);
    expect(() => parser.parse("v-1 C3")).toThrow('Expected [0-9] but "-" found.');
  });

  it("throws error for invalid pitch range", () => {
    expect(() => parser.parse("C-3")).toThrow(/outside valid range/);
    expect(() => parser.parse("C9")).toThrow(/outside valid range/);
  });

  it("handles mixed ordering of state and notes", () => {
    expect(parser.parse("1:1 v100 C3 t0.5 D3 E3")).toStrictEqual([
      {
        name: "C3",
        pitch: 60,
        start: { bar: 1, beat: 1 },
        velocity: 100,
        duration: 1.0, // Uses default duration
      },
      {
        name: "D3",
        pitch: 62,
        start: { bar: 1, beat: 1 },
        velocity: 100,
        duration: 0.5, // Uses updated duration
      },
      {
        name: "E3",
        pitch: 64,
        start: { bar: 1, beat: 1 },
        velocity: 100,
        duration: 0.5, // Duration persists
      },
    ]);
  });

  it("handles empty input", () => {
    expect(parser.parse("")).toStrictEqual([]);
    expect(parser.parse("   \n  \t  ")).toStrictEqual([]);
  });

  it("handles state-only input", () => {
    expect(parser.parse("1:2 v90 t0.5")).toStrictEqual([]);
  });
});
