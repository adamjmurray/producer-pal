// device/tone-lang-parser.test.js
import { describe, it, expect } from "vitest";
import parser from "./tone-lang-parser";

/*
You can also manually test with:
```js
const parser = require("./tone-lang-parser");

const input = "C3 D3 E3 F3 G3 A3 B3 C4";
const ast = parser.parse(input);

console.log(JSON.stringify(ast, null, 2));
```
*/

describe("ToneLang Parser", () => {
  it("parses simple notes", () => {
    const ast = parser.parse("C3 D3 E3");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 1, velocity: 70 },
      { type: "note", name: "D3", pitch: 62, duration: 1, velocity: 70 },
      { type: "note", name: "E3", pitch: 64, duration: 1, velocity: 70 },
    ]);
  });

  it("parses notes with velocities and durations", () => {
    const ast = parser.parse("C3v90*2 D3v60/2 E3v100/4");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 2, velocity: 90 },
      { type: "note", name: "D3", pitch: 62, duration: 0.5, velocity: 60 },
      { type: "note", name: "E3", pitch: 64, duration: 0.25, velocity: 100 },
    ]);
  });

  it("parses notes with velocity only", () => {
    const ast = parser.parse("C3v80 D3v60");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 1, velocity: 80 },
      { type: "note", name: "D3", pitch: 62, duration: 1, velocity: 60 },
    ]);
  });

  it("parses notes with duration only", () => {
    const ast = parser.parse("C3*2 D3/2");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 2, velocity: 70 },
      { type: "note", name: "D3", pitch: 62, duration: 0.5, velocity: 70 },
    ]);
  });

  it("parses chords", () => {
    const ast = parser.parse("[C3 E3 G3]");
    expect(ast).toEqual([
      {
        type: "chord",
        notes: [
          { name: "C3", pitch: 60 },
          { name: "E3", pitch: 64 },
          { name: "G3", pitch: 67 },
        ],
        duration: 1,
        velocity: 70,
      },
    ]);
  });

  it("parses chords with velocity and duration", () => {
    const ast = parser.parse("[C3 E3 G3]v80*2");
    expect(ast).toEqual([
      {
        type: "chord",
        notes: [
          { name: "C3", pitch: 60 },
          { name: "E3", pitch: 64 },
          { name: "G3", pitch: 67 },
        ],
        duration: 2,
        velocity: 80,
      },
    ]);
  });

  it("parses rests", () => {
    const ast = parser.parse("R R/2 R*2");
    expect(ast).toEqual([
      { type: "rest", duration: 1 },
      { type: "rest", duration: 0.5 },
      { type: "rest", duration: 2 },
    ]);
  });

  it("parses complex sequence", () => {
    const ast = parser.parse("C3v80 D3v100/2 R/2 [E3 G3 B3]v90*2");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 1, velocity: 80 },
      { type: "note", name: "D3", pitch: 62, duration: 0.5, velocity: 100 },
      { type: "rest", duration: 0.5 },
      {
        type: "chord",
        notes: [
          { name: "E3", pitch: 64 },
          { name: "G3", pitch: 67 },
          { name: "B3", pitch: 71 },
        ],
        duration: 2,
        velocity: 90,
      },
    ]);
  });

  it("parses accidentals", () => {
    const ast = parser.parse("F#3v90 Eb3v70");
    expect(ast).toEqual([
      { type: "note", name: "F#3", pitch: 66, duration: 1, velocity: 90 },
      { type: "note", name: "Eb3", pitch: 63, duration: 1, velocity: 70 },
    ]);
  });

  it("ignores whitespace", () => {
    const ast = parser.parse(" C3  D3 \n [E3 G3] ");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 1, velocity: 70 },
      { type: "note", name: "D3", pitch: 62, duration: 1, velocity: 70 },
      {
        type: "chord",
        notes: [
          { name: "E3", pitch: 64 },
          { name: "G3", pitch: 67 },
        ],
        duration: 1,
        velocity: 70,
      },
    ]);
  });

  it("throws on invalid input", () => {
    expect(() => parser.parse("InvalidNote")).toThrow();
    expect(() => parser.parse("C3**2")).toThrow();
    expect(() => parser.parse("C3v999")).toThrow();
  });

  it("parses multiple voices separated by semicolons", () => {
    const ast = parser.parse("C3 D3; G3 A3");
    expect(Array.isArray(ast)).toBe(true);
    expect(Array.isArray(ast[0])).toBe(true);
    expect(Array.isArray(ast[1])).toBe(true);

    expect(ast[0]).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 1, velocity: 70 },
      { type: "note", name: "D3", pitch: 62, duration: 1, velocity: 70 },
    ]);

    expect(ast[1]).toEqual([
      { type: "note", name: "G3", pitch: 67, duration: 1, velocity: 70 },
      { type: "note", name: "A3", pitch: 69, duration: 1, velocity: 70 },
    ]);
  });

  it("handles newlines after semicolons", () => {
    const ast = parser.parse("C3 D3;\nG3 A3");
    expect(ast.length).toBe(2);
    expect(ast[0].length).toBe(2);
    expect(ast[1].length).toBe(2);
  });

  it("parses notes with shorthand velocity", () => {
    const ast = parser.parse("C3< D3> E3<<");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 1, velocity: 90 },
      { type: "note", name: "D3", pitch: 62, duration: 1, velocity: 50 },
      { type: "note", name: "E3", pitch: 64, duration: 1, velocity: 110 },
    ]);
  });

  it("parses chords with shorthand velocity", () => {
    const ast = parser.parse("[C3 E3 G3]<");
    expect(ast).toEqual([
      {
        type: "chord",
        notes: [
          { name: "C3", pitch: 60 },
          { name: "E3", pitch: 64 },
          { name: "G3", pitch: 67 },
        ],
        duration: 1,
        velocity: 90,
      },
    ]);
  });

  it("handles extreme shorthand velocity values", () => {
    const ast = parser.parse("C3<<< D3>>>");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 1, velocity: 127 },
      { type: "note", name: "D3", pitch: 62, duration: 1, velocity: 10 },
    ]);
  });
});
