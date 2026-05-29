// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import {
  drumPatternNotation,
  drumPatternNotes,
} from "#src/notation/barbeat/barbeat-test-fixtures.ts";
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

  it("handles duration state changes (absolute note values)", () => {
    // n/8 = eighth note = 0.5 quarter; n/2 = half note = 2 quarters (Ableton beats)
    const result = interpretNotation("n/8 C3 n/2 D3 E3 1|1");

    expect(result).toStrictEqual([
      createNote({ duration: 0.5 }),
      createNote({ pitch: 62, duration: 2.0 }),
      createNote({ pitch: 64, duration: 2.0 }),
    ]);
  });

  it("handles whole-note family durations in 4/4", () => {
    const result = interpretNotation("n/1 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    // n/1 = whole note = 4 quarters
    expect(result).toStrictEqual([createNote({ duration: 4 })]);
  });

  it("handles multi-whole-note durations (n5/4 in 4/4 = 5 quarters)", () => {
    const result = interpretNotation("n5/4 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result).toStrictEqual([createNote({ duration: 5 })]);
  });

  it("handles fractional sub-quarter durations (n3/16 = dotted eighth)", () => {
    const result = interpretNotation("n3/16 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    // 3/16 of a whole note = 0.75 quarter notes (dotted eighth)
    expect(result).toStrictEqual([createNote({ duration: 0.75 })]);
  });

  it("treats n/4 as a quarter regardless of meter (6/8)", () => {
    const result = interpretNotation("n/4 C3 1|1", {
      timeSigNumerator: 6,
      timeSigDenominator: 8,
    });

    // n/4 always = 1 quarter note = 1 Ableton beat, even in 6/8
    expect(result).toStrictEqual([createNote({ duration: 1 })]);
  });

  it("meter-fill: n3/4 fills a 6/8 bar (6 eighths = 3 quarters)", () => {
    const result = interpretNotation("n3/4 C3 1|1", {
      timeSigNumerator: 6,
      timeSigDenominator: 8,
    });

    expect(result).toStrictEqual([createNote({ duration: 3 })]);
  });

  it("triplet durations: n/12 = eighth-note triplet, n/6 = quarter-note triplet", () => {
    const result = interpretNotation("n/12 C3 1|1 n/6 D3 1|2", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    // n/12 = 1/3 quarter, n/6 = 2/3 quarter
    expect(result).toHaveLength(2);
    expect(result[0]!.duration).toBeCloseTo(1 / 3, 10);
    expect(result[1]!.duration).toBeCloseTo(2 / 3, 10);
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

  it("handles changing durations across notes", () => {
    // n2/1 = 2 whole = 8 quarters; n3/8 = dotted quarter = 1.5 quarters; n3/16 = dotted eighth = 0.75
    const result = interpretNotation("n2/1 C3 1|1 n3/8 D3 1|2 n3/16 E3 1|3", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result[0]!.duration).toBe(8);
    expect(result[1]!.duration).toBe(1.5);
    expect(result[2]!.duration).toBe(0.75);
  });

  it("handles sub-beat timing", () => {
    const result = interpretNotation("C3 1|1.5 D3 1|2.25");

    expect(result).toStrictEqual([
      createNote({ start_time: 0.5 }), // beat 1.5 = 0.5 beats from start
      createNote({ pitch: 62, start_time: 1.25 }), // beat 2.25 = 1.25 beats from start
    ]);
  });

  it("handles complex state combinations", () => {
    // n/16 = sixteenth = 0.25; n/4 = quarter = 1
    const result = interpretNotation(
      "v100 n/16 p0.9 C3 D3 1|1 v80-120 n/4 p0.7 E3 F3 1|2",
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
    const result = interpretNotation(drumPatternNotation);

    expect(result).toStrictEqual(drumPatternNotes);
  });
  it("maintains state across multiple bar boundaries", () => {
    // n/8 = eighth = 0.5 quarter
    const result = interpretNotation("v80 n/8 p0.8 C3 1|1 D3 3|2 E3 5|1");

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
    // n/8 = eighth = 0.5; n/4 = quarter = 1.0
    const result = interpretNotation(
      "n/8 v80 p0.7 C3 1|1 v100 n/4 p1.0 D3 2|1",
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

  it("warns when repeat time position has no pitches", () => {
    // Repeat pattern with no pitches (multiple positions)
    interpretNotation("1|1x3@n/4");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Time position has no pitches"),
    );
  });
});
