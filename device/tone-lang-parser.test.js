// device/tone-lang-parser.test.js
import { describe, expect, it } from "vitest";
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
      { type: "note", name: "C3", pitch: 60, duration: null, velocity: null },
      { type: "note", name: "D3", pitch: 62, duration: null, velocity: null },
      { type: "note", name: "E3", pitch: 64, duration: null, velocity: null },
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
      { type: "note", name: "C3", pitch: 60, duration: null, velocity: 80 },
      { type: "note", name: "D3", pitch: 62, duration: null, velocity: 60 },
    ]);
  });

  it("parses notes with duration only", () => {
    const ast = parser.parse("C3*2 D3/2");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: 2, velocity: null },
      { type: "note", name: "D3", pitch: 62, duration: 0.5, velocity: null },
    ]);
  });

  it("parses chords", () => {
    const ast = parser.parse("[C3 E3 G3]");
    expect(ast).toEqual([
      {
        type: "chord",
        notes: [
          { type: "note", name: "C3", pitch: 60, duration: null, velocity: null },
          { type: "note", name: "E3", pitch: 64, duration: null, velocity: null },
          { type: "note", name: "G3", pitch: 67, duration: null, velocity: null },
        ],
        duration: null,
        velocity: null,
      },
    ]);
  });

  it("parses chords with velocity and duration", () => {
    const ast = parser.parse("[C3 E3 G3]v80*2");
    expect(ast).toEqual([
      {
        type: "chord",
        notes: [
          { type: "note", name: "C3", pitch: 60, duration: null, velocity: null },
          { type: "note", name: "E3", pitch: 64, duration: null, velocity: null },
          { type: "note", name: "G3", pitch: 67, duration: null, velocity: null },
        ],
        duration: 2,
        velocity: 80,
      },
    ]);
  });

  it("parses rests", () => {
    const ast = parser.parse("R R/2 R*2");
    expect(ast).toEqual([
      { type: "rest", duration: null },
      { type: "rest", duration: 0.5 },
      { type: "rest", duration: 2 },
    ]);
  });

  it("parses complex sequence", () => {
    const ast = parser.parse("C3v80 D3v100/2 R/2 [E3 G3 B3]v90*2");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: null, velocity: 80 },
      { type: "note", name: "D3", pitch: 62, duration: 0.5, velocity: 100 },
      { type: "rest", duration: 0.5 },
      {
        type: "chord",
        notes: [
          { type: "note", name: "E3", pitch: 64, duration: null, velocity: null },
          { type: "note", name: "G3", pitch: 67, duration: null, velocity: null },
          { type: "note", name: "B3", pitch: 71, duration: null, velocity: null },
        ],
        duration: 2,
        velocity: 90,
      },
    ]);
  });

  it("parses accidentals", () => {
    const ast = parser.parse("F#3v90 Eb3v70");
    expect(ast).toEqual([
      { type: "note", name: "F#3", pitch: 66, duration: null, velocity: 90 },
      { type: "note", name: "Eb3", pitch: 63, duration: null, velocity: 70 },
    ]);
  });

  it("ignores whitespace", () => {
    const ast = parser.parse(" C3  D3 \n [E3 G3] ");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: null, velocity: null },
      { type: "note", name: "D3", pitch: 62, duration: null, velocity: null },
      {
        type: "chord",
        notes: [
          { type: "note", name: "E3", pitch: 64, duration: null, velocity: null },
          { type: "note", name: "G3", pitch: 67, duration: null, velocity: null },
        ],
        duration: null,
        velocity: null,
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
      { type: "note", name: "C3", pitch: 60, duration: null, velocity: null },
      { type: "note", name: "D3", pitch: 62, duration: null, velocity: null },
    ]);

    expect(ast[1]).toEqual([
      { type: "note", name: "G3", pitch: 67, duration: null, velocity: null },
      { type: "note", name: "A3", pitch: 69, duration: null, velocity: null },
    ]);
  });

  it("handles newlines after semicolons", () => {
    const ast = parser.parse("C3 D3;\nG3 A3");
    expect(ast.length).toBe(2);
    expect(ast[0].length).toBe(2);
    expect(ast[1].length).toBe(2);
  });

  it("parses notes with shorthand velocity", () => {
    const ast = parser.parse("C3> D3< E3>>");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: null, velocity: 90 },
      { type: "note", name: "D3", pitch: 62, duration: null, velocity: 50 },
      { type: "note", name: "E3", pitch: 64, duration: null, velocity: 110 },
    ]);
  });

  it("requires whitespace between notes in chords", () => {
    // This should parse successfully
    expect(parser.parse("[C3 E3 G3]")).toBeDefined();

    // This should throw an error - notes jammed together
    expect(() => parser.parse("[C3E3G3]")).toThrow();

    // Flexible whitespace is allowed (newlines, extra spaces)
    expect(parser.parse("[ C3  E3\nG3 ]")).toBeDefined();
  });

  it("requires whitespace between elements in a sequence", () => {
    // Standard whitespace works
    expect(parser.parse("C3 D3 E3")).toBeDefined();

    // No whitespace between elements should fail
    expect(() => parser.parse("C3D3E3")).toThrow();

    // Mixed elements with required whitespace
    expect(parser.parse("C3 [E3 G3] R")).toBeDefined();

    // Mixed elements without whitespace should fail
    expect(() => parser.parse("C3[E3 G3]R")).toThrow();

    // Different whitespace types are acceptable
    expect(parser.parse("C3\tD3\nE3")).toBeDefined();

    // Extra whitespace is fine
    expect(parser.parse("C3  D3   E3")).toBeDefined();
  });

  it("parses chords with shorthand velocity", () => {
    const ast = parser.parse("[C3 E3 G3]>");
    expect(ast).toEqual([
      {
        type: "chord",
        notes: [
          { type: "note", name: "C3", pitch: 60, duration: null, velocity: null },
          { type: "note", name: "E3", pitch: 64, duration: null, velocity: null },
          { type: "note", name: "G3", pitch: 67, duration: null, velocity: null },
        ],
        duration: null,
        velocity: 90,
      },
    ]);
  });

  it("handles extreme shorthand velocity values", () => {
    const ast = parser.parse("C3>>> D3<<<");
    expect(ast).toEqual([
      { type: "note", name: "C3", pitch: 60, duration: null, velocity: 127 },
      { type: "note", name: "D3", pitch: 62, duration: null, velocity: 10 },
    ]);
  });
});
