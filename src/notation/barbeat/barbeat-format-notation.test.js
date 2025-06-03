// src/notation/barbeat/barbeat-format-notation.test.js
import { formatNotation } from "./barbeat-format-notation";
import { parseNotation } from "./barbeat-parse-notation";

describe("BarBeat formatNotation()", () => {
  it("returns empty string for empty input", () => {
    expect(formatNotation([])).toBe("");
    expect(formatNotation(null)).toBe("");
    expect(formatNotation(undefined)).toBe("");
  });

  it("formats simple notes with defaults", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 C3 D3 E3");
  });

  it("formats notes with time changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 64, start_time: 4, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 C3 1|2 D3 2|1 E3");
  });

  it("formats notes with probability changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 0.8, velocity_deviation: 0 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100, probability: 0.5, velocity_deviation: 0 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 100, probability: 0.5, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 p0.8 C3 p0.5 D3 E3");
  });

  it("formats notes with velocity changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 80, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 120, probability: 1.0, velocity_deviation: 0 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 120, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 v80 C3 v120 D3 E3");
  });

  it("formats notes with velocity range changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 80, probability: 1.0, velocity_deviation: 40 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 60, probability: 1.0, velocity_deviation: 40 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 60, probability: 1.0, velocity_deviation: 40 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 v80-120 C3 v60-100 D3 E3");
  });

  it("formats notes with mixed velocity and velocity range", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 80, probability: 1.0, velocity_deviation: 40 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 90, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 C3 v80-120 D3 v90 E3");
  });

  it("formats notes with duration changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 0.5, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 0, duration: 2.0, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 64, start_time: 0, duration: 2.0, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 t0.5 C3 t2 D3 E3");
  });

  it("formats sub-beat timing", () => {
    const notes = [
      { pitch: 60, start_time: 0.5, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 1.25, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1.5 C3 1|2.25 D3");
  });

  it("handles different time signatures with beatsPerBar option (legacy)", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 3, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes, { beatsPerBar: 3 });
    expect(result).toBe("1|1 C3 2|1 D3");
  });

  it("handles different time signatures with timeSigNumerator/timeSigDenominator", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 3, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes, { timeSigNumerator: 3, timeSigDenominator: 4 });
    expect(result).toBe("1|1 C3 2|1 D3");
  });

  it("prefers timeSigNumerator/timeSigDenominator over beatsPerBar", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 3, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes, {
      beatsPerBar: 4,
      timeSigNumerator: 3,
      timeSigDenominator: 4,
    });
    expect(result).toBe("1|1 C3 2|1 D3"); // Uses 3 beats per bar, not 4
  });

  it("throws error when only timeSigNumerator is provided", () => {
    const notes = [{ pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 }];
    expect(() => formatNotation(notes, { timeSigNumerator: 4 })).toThrow(
      "Time signature must be specified with both numerator and denominator",
    );
  });

  it("throws error when only timeSigDenominator is provided", () => {
    const notes = [{ pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 }];
    expect(() => formatNotation(notes, { timeSigDenominator: 4 })).toThrow(
      "Time signature must be specified with both numerator and denominator",
    );
  });

  it("omits redundant state changes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 64, start_time: 2, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 C3 1|2 D3 1|3 E3");
  });

  it("sorts notes by time then pitch", () => {
    const notes = [
      { pitch: 64, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 C3 D3 E3");
  });

  it("creates roundtrip compatibility with parseNotation", () => {
    const original = "1|1 p0.8 v80-120 t0.5 C3 D3 1|2.25 v120 p1.0 t2 E3 F3";
    const parsed = parseNotation(original);
    const formatted = formatNotation(parsed);
    const reparsed = parseNotation(formatted);

    expect(parsed).toEqual(reparsed);
  });

  it("creates roundtrip compatibility with parseNotation using time signatures", () => {
    const original = "1|1 p0.8 v80-120 t0.5 C3 D3 1|2.25 v120 p1.0 t2 E3 F3";
    const parsed = parseNotation(original, { timeSigNumerator: 3, timeSigDenominator: 4 });
    const formatted = formatNotation(parsed, { timeSigNumerator: 3, timeSigDenominator: 4 });
    const reparsed = parseNotation(formatted, { timeSigNumerator: 3, timeSigDenominator: 4 });

    expect(parsed).toEqual(reparsed);
  });

  it("handles complex drum pattern with probability and velocity range", () => {
    const notes = [
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100, probability: 1.0, velocity_deviation: 0 }, // C1 (kick)
      { pitch: 42, start_time: 0, duration: 0.25, velocity: 80, probability: 0.8, velocity_deviation: 20 }, // Gb1 (hihat)
      { pitch: 42, start_time: 0.5, duration: 0.25, velocity: 80, probability: 0.6, velocity_deviation: 20 }, // Gb1 (hihat)
      { pitch: 38, start_time: 1, duration: 0.25, velocity: 90, probability: 1.0, velocity_deviation: 0 }, // D1 (snare)
      { pitch: 42, start_time: 1, duration: 0.25, velocity: 100, probability: 0.9, velocity_deviation: 0 }, // Gb1 (hihat)
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 t0.25 C1 v80-100 p0.8 Gb1 1|1.5 p0.6 Gb1 1|2 v90 p1 D1 v100 p0.9 Gb1");
  });

  it("handles notes with missing probability and velocity_deviation properties", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 80 }, // Missing probability and velocity_deviation
      { pitch: 62, start_time: 0, duration: 1, velocity: 100, probability: 0.7 }, // Missing velocity_deviation
      { pitch: 64, start_time: 0, duration: 1, velocity: 100, velocity_deviation: 20 }, // Missing probability
    ];
    const result = formatNotation(notes);
    expect(result).toBe("1|1 v80 C3 v100 p0.7 D3 v100-120 p1 E3");
  });
});
