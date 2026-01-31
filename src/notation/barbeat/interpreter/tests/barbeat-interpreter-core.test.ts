import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";

describe("bar|beat interpretNotation() - core functionality", () => {
  it("returns empty array for empty input", () => {
    expect(interpretNotation("")).toStrictEqual([]);
    expect(interpretNotation(null as unknown as string)).toStrictEqual([]);
    expect(interpretNotation(undefined as unknown as string)).toStrictEqual([]);
  });

  it("parses simple notes with defaults", () => {
    const result = interpretNotation("C3 D3 E3 1|1");

    expect(result).toStrictEqual([
      createNote(),
      createNote({ pitch: 62 }),
      createNote({ pitch: 64 }),
    ]);
  });

  it("handles time state changes", () => {
    const result = interpretNotation("C3 1|1 D3 1|2 E3 2|1");

    expect(result).toStrictEqual([
      createNote(), // bar 1, beat 1
      createNote({ pitch: 62, start_time: 1 }), // bar 1, beat 2
      createNote({ pitch: 64, start_time: 4 }), // bar 2, beat 1 (4 beats per bar)
    ]);
  });

  it("handles velocity state changes", () => {
    const result = interpretNotation("v80 C3 v120 D3 E3 1|1");

    expect(result).toStrictEqual([
      createNote({ velocity: 80 }),
      createNote({ pitch: 62, velocity: 120 }),
      createNote({ pitch: 64, velocity: 120 }),
    ]);
  });

  it("handles velocity range state changes", () => {
    const result = interpretNotation("v80-120 C3 v60-100 D3 E3 1|1");

    expect(result).toStrictEqual([
      createNote({ velocity: 80, velocity_deviation: 40 }),
      createNote({ pitch: 62, velocity: 60, velocity_deviation: 40 }),
      createNote({ pitch: 64, velocity: 60, velocity_deviation: 40 }),
    ]);
  });

  it("handles mixed velocity and velocity range", () => {
    const result = interpretNotation("v100 C3 v80-120 D3 v90 E3 1|1");

    expect(result).toStrictEqual([
      createNote(),
      createNote({ pitch: 62, velocity: 80, velocity_deviation: 40 }),
      createNote({ pitch: 64, velocity: 90 }),
    ]);
  });

  it("handles probability state changes", () => {
    const result = interpretNotation("p0.8 C3 p0.5 D3 E3 1|1");

    expect(result).toStrictEqual([
      createNote({ probability: 0.8 }),
      createNote({ pitch: 62, probability: 0.5 }),
      createNote({ pitch: 64, probability: 0.5 }),
    ]);
  });

  it("handles duration state changes", () => {
    const result = interpretNotation("t0.5 C3 t2.0 D3 E3 1|1");

    expect(result).toStrictEqual([
      createNote({ duration: 0.5 }),
      createNote({ pitch: 62, duration: 2.0 }),
      createNote({ pitch: 64, duration: 2.0 }),
    ]);
  });

  it("handles bar:beat duration format in 4/4 (NEW)", () => {
    const result = interpretNotation("t2:1.5 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    // 2 bars (8 beats) + 1.5 beats = 9.5 Ableton beats in 4/4
    expect(result).toStrictEqual([createNote({ duration: 9.5 })]);
  });

  it("handles bar:beat duration with fractions (NEW)", () => {
    const result = interpretNotation("t1:3/4 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    // 1 bar (4 beats) + 0.75 beats = 4.75 Ableton beats
    expect(result).toStrictEqual([createNote({ duration: 4.75 })]);
  });

  it("handles beat-only decimal duration (NEW)", () => {
    const result = interpretNotation("t2.5 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    // 2.5 beats in 4/4 = 2.5 Ableton beats
    expect(result).toStrictEqual([createNote({ duration: 2.5 })]);
  });

  it("handles beat-only fractional duration (NEW)", () => {
    const result = interpretNotation("t3/4 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    // 3/4 beats in 4/4 = 0.75 Ableton beats
    expect(result).toStrictEqual([createNote({ duration: 0.75 })]);
  });

  it("handles bar:beat duration in 6/8 time (NEW)", () => {
    const result = interpretNotation("t1:2 C3 1|1", {
      timeSigNumerator: 6,
      timeSigDenominator: 8,
    });

    // 1 bar (6 eighth notes) + 2 eighth notes = 8 eighth notes = 4 quarter notes
    expect(result).toStrictEqual([createNote({ duration: 4.0 })]);
  });

  it("handles duration with + operator in bar:beat format (NEW)", () => {
    const result = interpretNotation("t1:2+1/3 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.pitch).toBe(60);
    expect(result[0]!.start_time).toBe(0);
    expect(result[0]!.duration).toBeCloseTo(6 + 1 / 3, 10); // 1 bar (4 beats) + 2+1/3 beats = 6+1/3 beats
    expect(result[0]!.velocity).toBe(100);
    expect(result[0]!.probability).toBe(1.0);
    expect(result[0]!.velocity_deviation).toBe(0);
  });

  it("handles beat-only duration with + operator (NEW)", () => {
    const result = interpretNotation("t2+3/4 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    // 2+3/4 beats in 4/4 = 2.75 Ableton beats
    expect(result).toStrictEqual([createNote({ duration: 2.75 })]);
  });

  it("handles beat positions with + operator (NEW)", () => {
    const result = interpretNotation("C3 1|2+1/3 D3 1|2+3/4", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result).toHaveLength(2);

    // First note at 1|2+1/3
    expect(result[0]!.pitch).toBe(60);
    expect(result[0]!.start_time).toBeCloseTo(1 + 1 / 3, 10); // bar 1, beat 2+1/3
    expect(result[0]!.duration).toBe(1);
    expect(result[0]!.velocity).toBe(100);
    expect(result[0]!.probability).toBe(1.0);
    expect(result[0]!.velocity_deviation).toBe(0);

    // Second note at 1|2+3/4
    expect(result[1]!.pitch).toBe(62);
    expect(result[1]!.start_time).toBe(1.75); // bar 1, beat 2+3/4
    expect(result[1]!.duration).toBe(1);
    expect(result[1]!.velocity).toBe(100);
    expect(result[1]!.probability).toBe(1.0);
    expect(result[1]!.velocity_deviation).toBe(0);
  });

  it("handles mixed duration formats (NEW)", () => {
    const result = interpretNotation("t2:0 C3 1|1 t1.5 D3 1|2 t3/4 E3 1|3", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result[0]!.duration).toBe(8); // 2 bars = 8 beats
    expect(result[1]!.duration).toBe(1.5); // 1.5 beats
    expect(result[2]!.duration).toBe(0.75); // 3/4 beats
  });

  it("handles sub-beat timing", () => {
    const result = interpretNotation("C3 1|1.5 D3 |2.25");

    expect(result).toStrictEqual([
      createNote({ start_time: 0.5 }), // beat 1.5 = 0.5 beats from start
      createNote({ pitch: 62, start_time: 1.25 }), // beat 2.25 = 1.25 beats from start
    ]);
  });

  it("handles complex state combinations", () => {
    const result = interpretNotation(
      "v100 t0.25 p0.9 C3 D3 1|1 v80-120 t1.0 p0.7 E3 F3 |2",
    );

    expect(result).toStrictEqual([
      createNote({ duration: 0.25, probability: 0.9 }),
      createNote({ pitch: 62, duration: 0.25, probability: 0.9 }),
      createNote({
        pitch: 64,
        start_time: 1,
        velocity: 80,
        probability: 0.7,
        velocity_deviation: 40,
      }),
      createNote({
        pitch: 65,
        start_time: 1,
        velocity: 80,
        probability: 0.7,
        velocity_deviation: 40,
      }),
    ]);
  });

  it("handles drum pattern example with probability and velocity range", () => {
    const result = interpretNotation(`
      v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1|1
      p0.6 Gb1 |1.5
      v90 p1.0 D1 v100 p0.9 Gb1 |2
    `);

    expect(result).toStrictEqual([
      createNote({ pitch: 36, duration: 0.25 }), // C1 (kick)
      createNote({
        pitch: 42,
        duration: 0.25,
        velocity: 80,
        probability: 0.8,
        velocity_deviation: 20,
      }), // Gb1 (hihat)
      createNote({
        pitch: 42,
        start_time: 0.5,
        duration: 0.25,
        velocity: 80,
        probability: 0.6,
        velocity_deviation: 20,
      }), // Gb1 (hihat)
      createNote({ pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }), // D1 (snare)
      createNote({
        pitch: 42,
        start_time: 1,
        duration: 0.25,
        probability: 0.9,
      }), // Gb1 (hihat)
    ]);
  });
  it("maintains state across multiple bar boundaries", () => {
    const result = interpretNotation("v80 t0.5 p0.8 C3 1|1 D3 3|2 E3 5|1");

    expect(result).toStrictEqual([
      createNote({ duration: 0.5, velocity: 80, probability: 0.8 }), // bar 1, beat 1
      createNote({
        pitch: 62,
        start_time: 9,
        duration: 0.5,
        velocity: 80,
        probability: 0.8,
      }), // bar 3, beat 2
      createNote({
        pitch: 64,
        start_time: 16,
        duration: 0.5,
        velocity: 80,
        probability: 0.8,
      }), // bar 5, beat 1
    ]);
  });

  it("handles velocity range validation", () => {
    expect(() => interpretNotation("v128-130 C3")).toThrow(
      "Invalid velocity range 128-130",
    );
    expect(() => interpretNotation("v-1-100 C3")).toThrow();
  });

  it("handles probability range validation", () => {
    expect(() => interpretNotation("p1.5 C3")).toThrow(
      "Note probability 1.5 outside valid range 0.0-1.0",
    );
  });

  it("handles pitch range validation", () => {
    expect(() => interpretNotation("C-3")).toThrow(/outside valid range/);
    expect(() => interpretNotation("C9")).toThrow(/outside valid range/);
  });

  it("provides helpful error messages for syntax errors", () => {
    expect(() => interpretNotation("invalid syntax")).toThrow(
      /bar|beat syntax error.*at position/,
    );
  });

  it("handles mixed order of state changes", () => {
    const result = interpretNotation(
      "t0.5 v80 p0.7 C3 1|1 v100 t1.0 p1.0 D3 2|1",
    );

    expect(result).toStrictEqual([
      createNote({ duration: 0.5, velocity: 80, probability: 0.7 }),
      createNote({ pitch: 62, start_time: 4 }),
    ]);
  });

  it("handles enharmonic equivalents", () => {
    const result = interpretNotation("C#3 Db3 F#3 Gb3 1|1");

    expect(result).toStrictEqual([
      createNote({ pitch: 61 }), // C#3
      createNote({ pitch: 61 }), // Db3 (same as C#3)
      createNote({ pitch: 66 }), // F#3
      createNote({ pitch: 66 }), // Gb3 (same as F#3)
    ]);
  });

  it("preserves notes with velocity 0 for deletion logic", () => {
    const result = interpretNotation("v100 C3 v0 D3 v80 E3 1|1");

    expect(result).toStrictEqual([
      createNote(),
      createNote({ pitch: 64, velocity: 80 }),
    ]);
  });

  it("treats velocity range starting at 0 as v0 deletion", () => {
    // Live API rejects velocity 0 even with deviation, so v0-50 becomes a deletion marker
    const result = interpretNotation("v0-50 C3 v50-100 D3 1|1");

    expect(result).toStrictEqual([
      createNote({ pitch: 62, velocity: 50, velocity_deviation: 50 }),
    ]);
  });

  it("preserves all v0 notes for deletion logic", () => {
    const result = interpretNotation("v0 C3 D3 E3 1|1");

    expect(result).toStrictEqual([]);
  });

  it("warns when time position has no pitches", () => {
    // Time position with no pitches
    interpretNotation("1|1");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Time position 1|1 has no pitches"),
    );
  });
});
