// device/tone-lang.test.js
import { describe, it, expect } from "vitest";
const { parseToneLang } = require("./tone-lang");

describe("parseToneLang", () => {
  it("returns empty array for empty input", () => {
    expect(parseToneLang("")).toEqual([]);
    expect(parseToneLang(null)).toEqual([]);
    expect(parseToneLang(undefined)).toEqual([]);
  });

  it("parses a sequence of single notes", () => {
    const result = parseToneLang("C3 D3 E3");
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ pitch: 60, start_time: 0, duration: 1 });
    expect(result[1]).toMatchObject({ pitch: 62, start_time: 1, duration: 1 });
    expect(result[2]).toMatchObject({ pitch: 64, start_time: 2, duration: 1 });
  });

  it("parses notes with durations", () => {
    const result = parseToneLang("C3/2 D3*2");
    expect(result[0].duration).toBe(0.5);
    expect(result[1].duration).toBe(2);
    expect(result[1].start_time).toBe(0.5);
  });

  it("parses notes with velocity", () => {
    const result = parseToneLang("C3v80 D3v127 E3v0");
    expect(result[0].velocity).toBe(80);
    expect(result[1].velocity).toBe(127);
    expect(result[2].velocity).toBe(0);
  });

  it("parses chords", () => {
    const result = parseToneLang("[C3 E3 G3]");
    expect(result).toHaveLength(3);
    result.forEach((note) => {
      expect(note.start_time).toBe(0);
      expect(note.duration).toBe(1);
      expect(note.velocity).toBe(100);
    });
  });

  it("parses chords with velocity and duration", () => {
    const result = parseToneLang("[C3 E3 G3]v90*2");
    expect(result).toHaveLength(3);
    result.forEach((note) => {
      expect(note.duration).toBe(2);
      expect(note.velocity).toBe(90);
    });
  });

  it("parses rests and adjusts time", () => {
    const result = parseToneLang("C3 R D3");
    expect(result).toHaveLength(2);
    expect(result[1].start_time).toBe(2); // C3 (1) + R (1)
  });

  it("handles mixed notes, chords, and rests", () => {
    const result = parseToneLang("C3 [D3 F3] R E3");
    expect(result).toHaveLength(4);
    expect(result[0].start_time).toBe(0); // C3
    expect(result[1].start_time).toBe(1); // D3 (chord)
    expect(result[2].start_time).toBe(1); // F3 (chord)
    expect(result[3].start_time).toBe(3); // E3 after rest
  });

  it("handles invalid velocity range by throwing", () => {
    expect(() => parseToneLang("C3v999")).toThrow();
    expect(() => parseToneLang("D3v-5")).toThrow();
  });

  it("handles invalid syntax by throwing", () => {
    expect(() => parseToneLang("invalid-input!!")).toThrow();
  });

  it("throws on invalid tokens", () => {
    expect(() => parseToneLang("C3 X9 E3")).toThrow();
  });

  it("parses notes with floating point durations", () => {
    const result = parseToneLang("C3*1.5 D3/1.5");
    expect(result[0].duration).toBeCloseTo(1.5);
    expect(result[1].duration).toBeCloseTo(1 / 1.5, 5);
    expect(result[1].start_time).toBeCloseTo(1.5);
  });

  it("parses multiple voices into a flattened note list", () => {
    const result = parseToneLang("C3 D3; G3 A3");

    expect(result.length).toBe(4);

    // Check pitches
    expect(result[0].pitch).toBe(60); // C3
    expect(result[1].pitch).toBe(62); // D3
    expect(result[2].pitch).toBe(67); // G3
    expect(result[3].pitch).toBe(69); // A3

    // Check timing
    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(1);
    expect(result[2].start_time).toBe(0); // Second voice starts at 0
    expect(result[3].start_time).toBe(1);
  });

  it("handles complex multi-voice patterns", () => {
    const result = parseToneLang("C3*2 D3/2 E3/2; G3 A3*2 B3");

    expect(result.length).toBe(6);

    // Check timing
    expect(result[0].duration).toBe(2); // C3*2
    expect(result[1].start_time).toBe(2); // After C3*2
    expect(result[1].duration).toBe(0.5); // D3/2

    expect(result[3].start_time).toBe(0); // G3 starts at beginning of second voice
    expect(result[4].duration).toBe(2); // A3*2
  });
});
