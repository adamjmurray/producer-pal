// src/notation/barbeat/barbeat.test.js
import { describe, expect, it } from "vitest";
import { formatNotation, parseNotation } from "./barbeat";

describe("BarBeat parseNotation", () => {
  it("returns empty array for empty input", () => {
    expect(parseNotation("")).toEqual([]);
    expect(parseNotation(null)).toEqual([]);
    expect(parseNotation(undefined)).toEqual([]);
  });

  it("parses simple notes with defaults", () => {
    const result = parseNotation("C3 D3 E3");
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 100 },
    ]);
  });

  it("handles time state changes", () => {
    const result = parseNotation("1:1 C3 1:2 D3 2:1 E3");
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // bar 1, beat 1
      { pitch: 62, start_time: 1, duration: 1, velocity: 100 }, // bar 1, beat 2
      { pitch: 64, start_time: 4, duration: 1, velocity: 100 }, // bar 2, beat 1 (4 beats per bar)
    ]);
  });

  it("handles velocity state changes", () => {
    const result = parseNotation("v80 C3 v120 D3 E3");
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 80 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 120 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 120 },
    ]);
  });

  it("handles duration state changes", () => {
    const result = parseNotation("t0.5 C3 t2.0 D3 E3");
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 0.5, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 2.0, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 2.0, velocity: 100 },
    ]);
  });

  it("handles sub-beat timing", () => {
    const result = parseNotation("1:1.5 C3 1:2.25 D3");
    expect(result).toEqual([
      { pitch: 60, start_time: 0.5, duration: 1, velocity: 100 }, // beat 1.5 = 0.5 beats from start
      { pitch: 62, start_time: 1.25, duration: 1, velocity: 100 }, // beat 2.25 = 1.25 beats from start
    ]);
  });

  it("handles complex state combinations", () => {
    const result = parseNotation("1:1 v100 t0.25 C3 D3 1:2 v80 t1.0 E3 F3");
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 64, start_time: 1, duration: 1.0, velocity: 80 },
      { pitch: 65, start_time: 1, duration: 1.0, velocity: 80 },
    ]);
  });

  it("handles drum pattern example", () => {
    const result = parseNotation(`
      1:1 v100 t0.25 C1 Gb1
      1:1.5 v60 Gb1  
      1:2 v90 D1
      v100 Gb1
    `);
    expect(result).toEqual([
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 }, // C1 (kick)
      { pitch: 42, start_time: 0, duration: 0.25, velocity: 100 }, // Gb1 (hihat)
      { pitch: 42, start_time: 0.5, duration: 0.25, velocity: 60 }, // Gb1 (hihat)
      { pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }, // D1 (snare)
      { pitch: 42, start_time: 1, duration: 0.25, velocity: 100 }, // Gb1 (hihat)
    ]);
  });

  it("supports different time signatures via the beatsPerBar option", () => {
    const result = parseNotation("1:1 C3 2:1 D3", { beatsPerBar: 3 });
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // bar 1, beat 1
      { pitch: 62, start_time: 3, duration: 1, velocity: 100 }, // bar 2, beat 1 (3 beats per bar)
    ]);
  });

  it("maintains state across multiple bar boundaries", () => {
    const result = parseNotation("1:1 v80 t0.5 C3 3:2 D3 5:1 E3");
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 0.5, velocity: 80 }, // bar 1, beat 1
      { pitch: 62, start_time: 9, duration: 0.5, velocity: 80 }, // bar 3, beat 2 = (3-1)*4 + (2-1) = 9
      { pitch: 64, start_time: 16, duration: 0.5, velocity: 80 }, // bar 5, beat 1 = (5-1)*4 + (1-1) = 16
    ]);
  });

  it("handles velocity range validation", () => {
    expect(() => parseNotation("v128 C3")).toThrow("MIDI velocity 128 outside valid range 0-127");
    expect(() => parseNotation("v-1 C3")).toThrow();
  });

  it("handles pitch range validation", () => {
    expect(() => parseNotation("C-3")).toThrow(/outside valid range/);
    expect(() => parseNotation("C9")).toThrow(/outside valid range/);
  });

  it("provides helpful error messages for syntax errors", () => {
    expect(() => parseNotation("invalid syntax")).toThrow(/BarBeat syntax error.*at position/);
  });

  it("handles mixed order of state changes", () => {
    const result = parseNotation("t0.5 1:1 v80 C3 v100 2:1 t1.0 D3");
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 0.5, velocity: 80 },
      { pitch: 62, start_time: 4, duration: 1.0, velocity: 100 },
    ]);
  });

  it("handles enharmonic equivalents", () => {
    const result = parseNotation("C#3 Db3 F#3 Gb3");
    expect(result).toEqual([
      { pitch: 61, start_time: 0, duration: 1, velocity: 100 }, // C#3
      { pitch: 61, start_time: 0, duration: 1, velocity: 100 }, // Db3 (same as C#3)
      { pitch: 66, start_time: 0, duration: 1, velocity: 100 }, // F#3
      { pitch: 66, start_time: 0, duration: 1, velocity: 100 }, // Gb3 (same as F#3)
    ]);
  });
});

describe("BarBeat formatNotation", () => {
  it("returns empty string for empty input", () => {
    expect(formatNotation([])).toBe("");
    expect(formatNotation(null)).toBe("");
    expect(formatNotation(undefined)).toBe("");
  });

  it("formats simple notes with defaults", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 100 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1:1 C3 D3 E3");
  });

  it("formats notes with time changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 4, duration: 1, velocity: 100 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1:1 C3 1:2 D3 2:1 E3");
  });

  it("formats notes with velocity changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 80 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 120 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 120 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1:1 v80 C3 v120 D3 E3");
  });

  it("formats notes with duration changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 0.5, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 2.0, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 2.0, velocity: 100 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1:1 t0.5 C3 t2 D3 E3");
  });

  it("formats sub-beat timing", () => {
    const notes = [
      { pitch: 60, start_time: 0.5, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 1.25, duration: 1, velocity: 100 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1:1.5 C3 1:2.25 D3");
  });

  it("handles different time signatures", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 3, duration: 1, velocity: 100 },
    ];
    const result = formatNotation(notes, { beatsPerBar: 3 });
    expect(result).toBe("1:1 C3 2:1 D3");
  });

  it("omits redundant state changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 2, duration: 1, velocity: 100 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1:1 C3 1:2 D3 1:3 E3");
  });

  it("sorts notes by time then pitch", () => {
    const notes = [
      { pitch: 64, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1:1 C3 D3 E3");
  });

  it("creates roundtrip compatibility with parseNotation", () => {
    const original = "1:1 v80 t0.5 C3 D3 1:2.25 v120 t2 E3 F3";
    const parsed = parseNotation(original);
    const formatted = formatNotation(parsed);
    const reparsed = parseNotation(formatted);

    expect(parsed).toEqual(reparsed);
  });

  it("handles complex drum pattern", () => {
    const notes = [
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 }, // C1 (kick)
      { pitch: 42, start_time: 0, duration: 0.25, velocity: 100 }, // Gb1 (hihat)
      { pitch: 42, start_time: 0.5, duration: 0.25, velocity: 60 }, // Gb1 (hihat)
      { pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }, // D1 (snare)
      { pitch: 42, start_time: 1, duration: 0.25, velocity: 100 }, // Gb1 (hihat)
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1:1 t0.25 C1 Gb1 1:1.5 v60 Gb1 1:2 v90 D1 v100 Gb1");
  });
});
