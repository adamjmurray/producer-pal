// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import {
  drumPatternNotation,
  drumPatternNotes,
} from "#src/notation/barbeat/barbeat-test-helpers.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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

  it("interprets case-insensitive and enharmonic note names", () => {
    // Lowercase letters, an all-caps flat (GB1 = Gb1), a Unicode ♭, and the two
    // octave-wrapping enharmonics (E# → F, B# → C of the next octave) resolve to
    // the same MIDI numbers the canonical spellings would. All five buffer into
    // one chord at 1|1.
    const result = interpretNotation("e#3 cb4 gb1 D♭1 B#3 1|1");

    expect(result).toStrictEqual([
      createNote({ pitch: 65 }), // e#3 → F3
      createNote({ pitch: 71 }), // cb4 → B3
      createNote({ pitch: 42 }), // gb1 → Gb1
      createNote({ pitch: 37 }), // D♭1 → Db1
      createNote({ pitch: 72 }), // B#3 → C4
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

  it("handles beat positions with ±n note-value offsets", () => {
    // 2+n/12 = beat 2 + 1/3 (eighth triplet); 2+n3/16 = beat 2 + 3/4
    const result = interpretNotation("C3 1|2+n/12 D3 1|2+n3/16", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result).toHaveLength(2);

    // First note at 1|2+n/12
    expect(result[0]!.pitch).toBe(60);
    expect(result[0]!.start_time).toBeCloseTo(1 + 1 / 3, 10); // bar 1, beat 2+1/3
    expect(result[0]!.duration).toBe(1);
    expect(result[0]!.velocity).toBe(100);
    expect(result[0]!.probability).toBe(1.0);
    expect(result[0]!.velocity_deviation).toBe(0);

    // Second note at 1|2+n3/16
    expect(result[1]!.pitch).toBe(62);
    expect(result[1]!.start_time).toBe(1.75); // bar 1, beat 2+3/4
    expect(result[1]!.duration).toBe(1);
    expect(result[1]!.velocity).toBe(100);
    expect(result[1]!.probability).toBe(1.0);
    expect(result[1]!.velocity_deviation).toBe(0);
  });

  it("places a -n offset just before a downbeat by borrowing across the bar", () => {
    // `2|1-n/12` = an eighth triplet before the bar-2 downbeat. In 4/4 the
    // bar-2 downbeat is Ableton beat 4, so the note lands at 4 − 1/3.
    const in44 = interpretNotation("C3 2|1-n/12", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(in44).toHaveLength(1);
    expect(in44[0]!.start_time).toBeCloseTo(4 - 1 / 3, 10);

    // The eighth triplet is meter-invariant: the same 1/3-Ableton-beat
    // displacement before the downbeat in 6/8 (whose bar is 3 Ableton beats).
    const in68 = interpretNotation("C3 2|1-n/12", {
      timeSigNumerator: 6,
      timeSigDenominator: 8,
    });

    expect(in68[0]!.start_time).toBeCloseTo(3 - 1 / 3, 10);

    // Reaching before 1|1 has no bar to borrow from, so it resolves to negative
    // time (a note before the clip start) — allowed, not rejected. Live accepts
    // notes at negative start_time.
    const before11 = interpretNotation("C3 1|1-n/12", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(before11).toHaveLength(1);
    expect(before11[0]!.start_time).toBeCloseTo(-1 / 3, 10);
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

  it("clamps out-of-range velocity and warns instead of throwing", () => {
    const result = interpretNotation("v128-130 C3 1|1");

    expect(result).toHaveLength(1);
    expect(result[0]!.velocity).toBe(127);
    expect(result[0]!.velocity_deviation).toBe(0);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("outside valid range 0-127; clamped to 127"),
    );
    // Malformed syntax (negative velocity) is still a fatal parse error.
    expect(() => interpretNotation("v-1-100 C3")).toThrow('but "v" found');
  });

  it("clamps out-of-range probability and warns instead of throwing", () => {
    const result = interpretNotation("p1.5 C3 1|1");

    expect(result).toHaveLength(1);
    expect(result[0]!.probability).toBe(1);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("outside valid range 0.0-1.0; clamped to 1"),
    );
  });

  it("skips out-of-range pitch and warns instead of throwing", () => {
    expect(interpretNotation("C-3 1|1")).toStrictEqual([]);
    expect(interpretNotation("C9 1|1")).toStrictEqual([]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("note skipped"),
    );
  });

  it("skips only the out-of-range pitch in a chord", () => {
    const result = interpretNotation("C9 E3 1|1");

    expect(result).toHaveLength(1);
    expect(result[0]!.pitch).toBe(64);
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

  it("rejects a velocity range starting at 0 (v0 is the delete sentinel)", () => {
    // `vA-B` desugars to base velocity = min(start,end); a base velocity of 0 is
    // the delete sentinel, so a 0 lower bound would silently delete every note.
    // Rejected at parse time rather than silently dropping notes.
    expect(() => interpretNotation("v0-50 C3 v50-100 D3 1|1")).toThrow(
      /velocity ranges must start at 1 or higher — v0 is the delete sentinel/,
    );
  });

  it("preserves all v0 notes for deletion logic", () => {
    const result = interpretNotation("v0 C3 D3 E3 1|1");

    expect(result).toStrictEqual([]);
  });

  it("warns when time position has no pitches", () => {
    // Time position with no pitches
    interpretNotation("1|1");

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("Time position 1|1 has no pitches"),
    );
  });

  it("warns when repeat time position has no pitches", () => {
    // Repeat pattern with no pitches (multiple positions)
    interpretNotation("1|1x3@n/4");

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("Time position has no pitches"),
    );
  });
});
