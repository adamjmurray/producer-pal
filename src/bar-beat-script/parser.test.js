// src/bar-beat-script/parser.test.js
import { describe, expect, it } from "vitest";
import * as parser from "./parser";

describe("BarBeatScript Parser", () => {
  it("parses notes with bar.beat.unit notation", () => {
    const ast = parser.parse("1.1.0:C3 1.2.0:D3 1.3.0:E3");

    const [note1, note2, note3] = ast;

    expect(note1.position).toEqual({ bar: 1, beat: 1, unit: 0 });
    expect(note2.position).toEqual({ bar: 1, beat: 2, unit: 0 });
    expect(note3.position).toEqual({ bar: 1, beat: 3, unit: 0 });

    expect(note1.pitch).toBe(60); // C3
    expect(note2.pitch).toBe(62); // D3
    expect(note3.pitch).toBe(64); // E3
  });

  it("parses notes with modifiers", () => {
    const ast = parser.parse("1.1.0:C3v80t2");
    const note = ast[0];

    expect(note.velocity).toBe(80);
    expect(note.duration).toBe(2);
  });

  it("implicitly forms chords with same position", () => {
    const ast = parser.parse("1.1.0:C3 1.1.0:E3 1.1.0:G3");

    const [note1, note2, note3] = ast;
    expect(note1.position).toEqual({ bar: 1, beat: 1, unit: 0 });
    expect(note2.position).toEqual({ bar: 1, beat: 1, unit: 0 });
    expect(note3.position).toEqual({ bar: 1, beat: 1, unit: 0 });

    expect(note1.pitch).toBe(60); // C3
    expect(note2.pitch).toBe(64); // E3
    expect(note3.pitch).toBe(67); // G3
  });

  it("handles different unit values", () => {
    const ast = parser.parse("1.1.120:C3 1.2.240:D3");

    const [note1, note2] = ast;
    expect(note1.position).toEqual({ bar: 1, beat: 1, unit: 120 });
    expect(note2.position).toEqual({ bar: 1, beat: 2, unit: 240 });
  });

  it("throws error for invalid syntax", () => {
    expect(() => parser.parse("C3")).toThrow(); // Missing position
    expect(() => parser.parse("1.1.0 C3")).toThrow(); // Missing colon
    expect(() => parser.parse("1.1:C3")).toThrow(); // Missing unit
    expect(() => parser.parse("0:C3")).toThrow(); // Missing bar.beat.unit format
  });

  it("throws error for duplicate modifiers", () => {
    expect(() => parser.parse("1.1.0:C3v80v90")).toThrow(/Duplicate modifier/);
    expect(() => parser.parse("1.1.0:C3t2t3")).toThrow(/Duplicate modifier/);
  });
});
