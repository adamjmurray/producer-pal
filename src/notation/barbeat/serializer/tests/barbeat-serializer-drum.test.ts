// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { createNote } from "#src/test/test-data-builders.ts";
import { drumPatternNotes } from "../../barbeat-test-fixtures.ts";
import { interpretNotation } from "../../interpreter/barbeat-interpreter.ts";
import { formatNotation } from "../barbeat-serializer.ts";

/**
 * Round-trip helper: serialize with drumMode → parse → interpret → compare.
 * @param notes - Notes to round-trip
 * @param options - Time signature options
 * @param options.timeSigNumerator - Time signature numerator
 * @param options.timeSigDenominator - Time signature denominator
 */
function expectDrumRoundTrip(
  notes: NoteEvent[],
  options?: { timeSigNumerator?: number; timeSigDenominator?: number },
): void {
  const formatted = formatNotation(notes, { ...options, drumMode: true });
  const reparsed = interpretNotation(formatted, options);
  const sortedOriginal = sortNotes(notes);
  const sortedReparsed = sortNotes(reparsed);

  expect(sortedReparsed).toHaveLength(sortedOriginal.length);

  for (let i = 0; i < sortedOriginal.length; i++) {
    const orig = sortedOriginal[i] as NoteEvent;
    const repr = sortedReparsed[i] as NoteEvent;

    expect(repr.pitch).toBe(orig.pitch);
    expect(repr.start_time).toBeCloseTo(orig.start_time, 8);
    expect(repr.duration).toBeCloseTo(orig.duration, 8);
    expect(repr.velocity).toBeCloseTo(orig.velocity, 8);
  }
}

/**
 * Sort notes for comparison (by start_time, then pitch)
 * @param notes - Notes to sort
 * @returns Sorted copy
 */
function sortNotes(notes: NoteEvent[]): NoteEvent[] {
  return [...notes].sort((a, b) =>
    a.start_time !== b.start_time
      ? a.start_time - b.start_time
      : a.pitch - b.pitch,
  );
}

describe("drum mode serializer", () => {
  it("groups notes by pitch", () => {
    const notes: NoteEvent[] = [
      createNote({ pitch: 36, start_time: 0, duration: 0.25 }),
      createNote({ pitch: 38, start_time: 0.5, duration: 0.25, velocity: 90 }),
      createNote({ pitch: 36, start_time: 1, duration: 0.25 }),
      createNote({ pitch: 38, start_time: 1.5, duration: 0.25, velocity: 90 }),
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    // C1 (kick) positions grouped and comma-merged, then D1 (snare)
    expect(result).toBe("t/4 C1 1|1,2 v90 D1 1|1.5,2.5");
  });

  it("comma-merges beats within same bar", () => {
    const notes: NoteEvent[] = [
      createNote({ pitch: 36, start_time: 0, duration: 0.25 }),
      createNote({ pitch: 36, start_time: 2, duration: 0.25 }),
      createNote({ pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }),
      createNote({ pitch: 38, start_time: 3, duration: 0.25, velocity: 90 }),
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    expect(result).toBe("t/4 C1 1|1,3 v90 D1 1|2,4");
  });

  it("detects repeat patterns (3+ evenly spaced)", () => {
    // 16th-note hi-hat pattern across 1 bar (16 hits)
    const notes: NoteEvent[] = Array.from({ length: 16 }, (_, i) =>
      createNote({
        pitch: 42,
        start_time: i * 0.25,
        duration: 0.25,
        velocity: 80,
      }),
    ) as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    // Step equals duration (0.25), so @step is omitted
    expect(result).toBe("v80 t/4 Gb1 1|1x16");
  });

  it("includes @step when step differs from duration", () => {
    // Kick on beats 1 and 3 of each of 4 bars (8 hits, step=2)
    const notes: NoteEvent[] = Array.from({ length: 8 }, (_, i) =>
      createNote({
        pitch: 36,
        start_time: i * 2,
        duration: 0.25,
      }),
    ) as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    expect(result).toBe("t/4 C1 1|1x8@2");
  });

  it("splits into state runs when velocity changes", () => {
    const notes: NoteEvent[] = [
      createNote({ pitch: 42, start_time: 0, duration: 0.25, velocity: 80 }),
      createNote({ pitch: 42, start_time: 0.5, duration: 0.25, velocity: 80 }),
      createNote({ pitch: 42, start_time: 1, duration: 0.25, velocity: 100 }),
      createNote({ pitch: 42, start_time: 1.5, duration: 0.25, velocity: 100 }),
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    // Two state runs for Gb1: v80 then v100
    expect(result).toBe("v80 t/4 Gb1 1|1,1.5 v100 Gb1 1|2,2.5");
  });

  it("handles single-note pitch groups", () => {
    const notes: NoteEvent[] = [
      createNote({ pitch: 36, start_time: 0, duration: 0.25 }),
      createNote({ pitch: 49, start_time: 0, duration: 0.25 }),
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    expect(result).toBe("t/4 C1 1|1 Db2 1|1");
  });

  it("preserves pitch order by first occurrence", () => {
    const notes: NoteEvent[] = [
      createNote({ pitch: 38, start_time: 0, duration: 0.25, velocity: 90 }),
      createNote({ pitch: 36, start_time: 0.5, duration: 0.25 }),
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    // D1 appears first because it has the earlier start_time
    expect(result).toBe("v90 t/4 D1 1|1 v100 C1 1|1.5");
  });

  it("handles multi-bar positions", () => {
    const notes: NoteEvent[] = [
      createNote({ pitch: 36, start_time: 0, duration: 0.25 }),
      createNote({ pitch: 36, start_time: 4, duration: 0.25 }),
      createNote({ pitch: 38, start_time: 2, duration: 0.25, velocity: 90 }),
      createNote({ pitch: 38, start_time: 6, duration: 0.25, velocity: 90 }),
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    expect(result).toBe("t/4 C1 1|1 2|1 v90 D1 1|3 2|3");
  });

  it("uses fraction formatting for positions and steps", () => {
    // Triplet hi-hat: every 1/3 beat
    const notes: NoteEvent[] = Array.from({ length: 6 }, (_, i) =>
      createNote({
        pitch: 42,
        start_time: (i * 4) / 3 / 4, // 1/3 of a beat
        duration: 1 / 3,
        velocity: 80,
      }),
    ) as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    // Duration 1/3 → t/3, step 1/3 → omitted (equals duration)
    expect(result).toBe("v80 t/3 Gb1 1|1x6");
  });

  describe("round-trip tests", () => {
    it("round-trips simple kick/snare pattern", () => {
      const notes: NoteEvent[] = [
        createNote({ pitch: 36, start_time: 0, duration: 0.25 }),
        createNote({ pitch: 36, start_time: 2, duration: 0.25 }),
        createNote({ pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }),
        createNote({ pitch: 38, start_time: 3, duration: 0.25, velocity: 90 }),
      ] as NoteEvent[];

      expectDrumRoundTrip(notes);
    });

    it("round-trips repeat pattern", () => {
      const notes: NoteEvent[] = Array.from({ length: 8 }, (_, i) =>
        createNote({
          pitch: 42,
          start_time: i * 0.5,
          duration: 0.25,
          velocity: 80,
        }),
      ) as NoteEvent[];

      expectDrumRoundTrip(notes);
    });

    it("round-trips drum pattern fixture", () => {
      expectDrumRoundTrip(drumPatternNotes);
    });

    it("round-trips multi-bar pattern with varied state", () => {
      const notes: NoteEvent[] = [
        createNote({ pitch: 36, start_time: 0, duration: 0.25 }),
        createNote({ pitch: 36, start_time: 2, duration: 0.25 }),
        createNote({ pitch: 36, start_time: 4, duration: 0.25 }),
        createNote({ pitch: 36, start_time: 6, duration: 0.25 }),
        createNote({ pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }),
        createNote({ pitch: 38, start_time: 3, duration: 0.25, velocity: 90 }),
        createNote({ pitch: 38, start_time: 5, duration: 0.25, velocity: 90 }),
        createNote({ pitch: 38, start_time: 7, duration: 0.25, velocity: 90 }),
        createNote({ pitch: 42, start_time: 0, duration: 0.25, velocity: 80 }),
        createNote({
          pitch: 42,
          start_time: 0.5,
          duration: 0.25,
          velocity: 80,
        }),
        createNote({ pitch: 42, start_time: 1, duration: 0.25, velocity: 80 }),
        createNote({
          pitch: 42,
          start_time: 1.5,
          duration: 0.25,
          velocity: 100,
        }),
        createNote({ pitch: 42, start_time: 2, duration: 0.25, velocity: 80 }),
        createNote({
          pitch: 42,
          start_time: 2.5,
          duration: 0.25,
          velocity: 80,
        }),
        createNote({ pitch: 42, start_time: 3, duration: 0.25, velocity: 80 }),
        createNote({
          pitch: 42,
          start_time: 3.5,
          duration: 0.25,
          velocity: 100,
        }),
      ] as NoteEvent[];

      expectDrumRoundTrip(notes);
    });
  });
});
