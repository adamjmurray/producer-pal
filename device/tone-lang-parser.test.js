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
      { type: "note", pitch: "C3", duration: 1, velocity: 100 },
      { type: "note", pitch: "D3", duration: 1, velocity: 100 },
      { type: "note", pitch: "E3", duration: 1, velocity: 100 },
    ]);
  });

  it("parses notes with velocities and durations", () => {
    const ast = parser.parse("C3v90*2 D3v60/2 E3v100/4");
    expect(ast).toEqual([
      { type: "note", pitch: "C3", duration: 2, velocity: 90 },
      { type: "note", pitch: "D3", duration: 0.5, velocity: 60 },
      { type: "note", pitch: "E3", duration: 0.25, velocity: 100 },
    ]);
  });

  it("parses notes with velocity only", () => {
    const ast = parser.parse("C3v80 D3v60");
    expect(ast).toEqual([
      { type: "note", pitch: "C3", duration: 1, velocity: 80 },
      { type: "note", pitch: "D3", duration: 1, velocity: 60 },
    ]);
  });

  it("parses notes with duration only", () => {
    const ast = parser.parse("C3*2 D3/2");
    expect(ast).toEqual([
      { type: "note", pitch: "C3", duration: 2, velocity: 100 },
      { type: "note", pitch: "D3", duration: 0.5, velocity: 100 },
    ]);
  });

  it("parses chords", () => {
    const ast = parser.parse("[C3 E3 G3]");
    expect(ast).toEqual([
      {
        type: "chord",
        notes: [{ pitch: "C3" }, { pitch: "E3" }, { pitch: "G3" }],
        duration: 1,
        velocity: 100,
      },
    ]);
  });

  it("parses chords with velocity and duration", () => {
    const ast = parser.parse("[C3 E3 G3]v80*2");
    expect(ast).toEqual([
      {
        type: "chord",
        notes: [{ pitch: "C3" }, { pitch: "E3" }, { pitch: "G3" }],
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
      { type: "note", pitch: "C3", duration: 1, velocity: 80 },
      { type: "note", pitch: "D3", duration: 0.5, velocity: 100 },
      { type: "rest", duration: 0.5 },
      {
        type: "chord",
        notes: [{ pitch: "E3" }, { pitch: "G3" }, { pitch: "B3" }],
        duration: 2,
        velocity: 90,
      },
    ]);
  });

  it("parses accidentals", () => {
    const ast = parser.parse("F#3v90 Eb3v70");
    expect(ast).toEqual([
      { type: "note", pitch: "F#3", duration: 1, velocity: 90 },
      { type: "note", pitch: "Eb3", duration: 1, velocity: 70 },
    ]);
  });

  it("ignores whitespace", () => {
    const ast = parser.parse(" C3  D3 \n [E3 G3] ");
    expect(ast).toEqual([
      { type: "note", pitch: "C3", duration: 1, velocity: 100 },
      { type: "note", pitch: "D3", duration: 1, velocity: 100 },
      {
        type: "chord",
        notes: [{ pitch: "E3" }, { pitch: "G3" }],
        duration: 1,
        velocity: 100,
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
      { type: "note", pitch: "C3", duration: 1, velocity: 100 },
      { type: "note", pitch: "D3", duration: 1, velocity: 100 },
    ]);

    expect(ast[1]).toEqual([
      { type: "note", pitch: "G3", duration: 1, velocity: 100 },
      { type: "note", pitch: "A3", duration: 1, velocity: 100 },
    ]);
  });

  it("handles newlines after semicolons", () => {
    const ast = parser.parse("C3 D3;\nG3 A3");
    expect(ast.length).toBe(2);
    expect(ast[0].length).toBe(2);
    expect(ast[1].length).toBe(2);
  });
});
