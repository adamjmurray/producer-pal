// src/notation/bar-beat-script/bbs.test.js
import { describe, expect, it } from "vitest";
import { formatNotation, parseNotation } from "./bbs";

describe("BarBeatScript parseNotation", () => {
  it("parses simple notes with bar.beat format", () => {
    const result = parseNotation("1.1:C3, 1.2:D3, 2.1:E3");

    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 70 },
      { pitch: 64, start_time: 4, duration: 1, velocity: 70 },
    ]);
  });

  it("parses notes with bar.beat.unit format", () => {
    const result = parseNotation("1.1.0:C3, 1.1.240:D3, 1.2.0:E3");

    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 0.5, duration: 1, velocity: 70 }, // 240/480 = 0.5
      { pitch: 64, start_time: 1, duration: 1, velocity: 70 },
    ]);
  });

  it("parses multiple notes at same start time", () => {
    const result = parseNotation("1.1.0:C3 E3 G3");

    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 67, start_time: 0, duration: 1, velocity: 70 },
    ]);
  });

  it("parses notes with velocity modifiers", () => {
    const result = parseNotation("1.1:C3v90, 1.2:D3v40");

    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 90 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 40 },
    ]);
  });

  it("parses notes with duration modifiers", () => {
    const result = parseNotation("1.1:C3t2, 1.2:D3t0.5");

    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 2, velocity: 70 },
      { pitch: 62, start_time: 1, duration: 0.5, velocity: 70 },
    ]);
  });

  it("parses notes with both velocity and duration modifiers", () => {
    const result = parseNotation("1.1:C3v80t2");

    expect(result).toEqual([{ pitch: 60, start_time: 0, duration: 2, velocity: 80 }]);
  });

  it("handles different time signatures", () => {
    const result = parseNotation("1.1:C3, 2.1:D3", { timeSignature: 3 });

    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 3, duration: 1, velocity: 70 }, // 3/4 time
    ]);
  });

  it("handles trailing commas and whitespace", () => {
    const result = parseNotation("  1.1:C3  ,  1.2:D3  ,  ");

    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 70 },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseNotation("")).toEqual([]);
    expect(parseNotation(null)).toEqual([]);
    expect(parseNotation(undefined)).toEqual([]);
  });

  it("throws error for invalid syntax", () => {
    expect(() => parseNotation("C3")).toThrow(/syntax error/);
    expect(() => parseNotation("1:C3")).toThrow(/syntax error/);
    expect(() => parseNotation("1.1.0 C3")).toThrow(/syntax error/); // missing colon
  });

  it("throws error for duplicate modifiers", () => {
    expect(() => parseNotation("1.1:C3v80v90")).toThrow(/Duplicate modifier/);
    expect(() => parseNotation("1.1:C3t2t3")).toThrow(/Duplicate modifier/);
  });

  it("handles sharp and flat notes", () => {
    const result = parseNotation("1.1:C#3, 1.2:Bb3");

    expect(result).toEqual([
      { pitch: 61, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 70, start_time: 1, duration: 1, velocity: 70 },
    ]);
  });
});

describe("BarBeatScript formatNotation", () => {
  it("formats simple notes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3, 1.2:D3");
  });

  it("formats notes with units for fractional beats", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 0.5, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3, 1.1.240:D3");
  });

  it("groups simultaneous notes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 67, start_time: 0, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3 E3 G3");
  });

  it("formats velocity modifiers", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 90 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 40 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3v90, 1.2:D3v40");
  });

  it("formats duration modifiers", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 2, velocity: 70 },
      { pitch: 62, start_time: 1, duration: 0.5, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3t2, 1.2:D3t0.5");
  });

  it("formats both velocity and duration modifiers", () => {
    const notes = [{ pitch: 60, start_time: 0, duration: 2, velocity: 80 }];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3v80t2");
  });

  it("handles different time signatures", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 3, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes, { timeSignature: 3 });
    expect(result).toBe("1.1:C3, 2.1:D3");
  });

  it("sorts notes by start time", () => {
    const notes = [
      { pitch: 62, start_time: 1, duration: 1, velocity: 70 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 64, start_time: 2, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3, 1.2:D3, 1.3:E3");
  });

  it("handles notes across multiple bars", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 4, duration: 1, velocity: 70 },
      { pitch: 64, start_time: 8, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3, 2.1:D3, 3.1:E3");
  });

  it("returns empty string for empty input", () => {
    expect(formatNotation([])).toBe("");
    expect(formatNotation(null)).toBe("");
    expect(formatNotation(undefined)).toBe("");
  });

  it("handles mixed simultaneous and sequential notes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 80 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:C3 E3v80, 1.2:D3");
  });

  it("handles sharp and flat notes in formatting", () => {
    const notes = [
      { pitch: 61, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 70, start_time: 1, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("1.1:Db3, 1.2:Bb3");
  });
});

describe("BarBeatScript roundtrip conversion", () => {
  it("maintains data through parse → format → parse cycle", () => {
    const original = "1.1:C3v80t2, 1.2.240:D3v90, 2.1:E3 G3";
    const parsed = parseNotation(original);
    const formatted = formatNotation(parsed);
    const reparsed = parseNotation(formatted);

    expect(reparsed).toEqual(parsed);
  });

  it("maintains data through format → parse → format cycle", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 2, velocity: 80 },
      { pitch: 62, start_time: 1.5, duration: 1, velocity: 90 },
      { pitch: 64, start_time: 4, duration: 1, velocity: 70 },
      { pitch: 67, start_time: 4, duration: 1, velocity: 70 },
    ];

    const formatted = formatNotation(notes);
    const parsed = parseNotation(formatted);
    const reformatted = formatNotation(parsed);

    expect(reformatted).toBe(formatted);
  });
});
