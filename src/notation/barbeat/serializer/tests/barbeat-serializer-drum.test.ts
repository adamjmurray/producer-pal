// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { createNote } from "#src/test/test-data-builders.ts";
import { drumPatternNotes } from "../../barbeat-test-fixtures.ts";
import { formatNotation } from "../barbeat-serializer.ts";
import { expectRoundTripNotes } from "./barbeat-serializer-test-helpers.ts";

/**
 * Round-trip helper for drum mode (skips probability/velocity_deviation checks).
 * @param notes - Notes to round-trip
 * @param options - Time signature options
 * @param options.timeSigNumerator - Time signature numerator
 * @param options.timeSigDenominator - Time signature denominator
 */
function expectDrumRoundTrip(
  notes: NoteEvent[],
  options?: { timeSigNumerator?: number; timeSigDenominator?: number },
): void {
  expectRoundTripNotes(notes, {
    ...options,
    drumMode: true,
    checkExpressiveFields: false,
  });
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

  it("does not use repeat pattern for non-uniform spacing", () => {
    // 3 notes with non-uniform spacing: 0, 1, 3 (steps 1, 2 - irregular)
    const notes: NoteEvent[] = [
      createNote({ pitch: 36, start_time: 0, duration: 0.25 }),
      createNote({ pitch: 36, start_time: 1, duration: 0.25 }),
      createNote({ pitch: 36, start_time: 3, duration: 0.25 }),
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    // Should list positions individually, not use repeat pattern
    expect(result).not.toContain("x3");
    expect(result).toContain("1|1");
  });

  it("prefers listing when repeat format is not shorter", () => {
    // Non-uniform in-bar spacing: beats 1, 2.5, 4
    const notes: NoteEvent[] = [
      createNote({ pitch: 36, start_time: 0, duration: 1 }),
      createNote({ pitch: 36, start_time: 1.5, duration: 1 }),
      createNote({ pitch: 36, start_time: 3, duration: 1 }),
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    // Non-uniform spacing, should use comma merge
    expect(result).not.toContain("x3");
  });

  it("handles drum notes with undefined probability", () => {
    // Tests ?? fallback in sameState for probability
    const notes = [
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 80 },
      { pitch: 36, start_time: 1, duration: 0.25, velocity: 80 },
    ] as NoteEvent[];

    const result = formatNotation(notes, { drumMode: true });

    // Both notes have same state (undefined probability defaults equal),
    // so they should merge into comma format with no probability prefix
    expect(result).toBe("v80 t/4 C1 1|1,2");
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
