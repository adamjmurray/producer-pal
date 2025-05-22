// src/notation/barbeat/barbeat-format-notation.test.js
import { formatNotation } from "./barbeat-format-notation";
import { parseNotation } from "./barbeat-parse-notation";

describe("BarBeat formatNotatio()n", () => {
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
