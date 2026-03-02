// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { drumPatternNotes } from "../../barbeat-test-fixtures.ts";
import { formatNotation } from "../barbeat-serializer.ts";
import { interpretNotation } from "../../interpreter/barbeat-interpreter.ts";

/** Tolerance for floating-point comparison (covers fraction round-trip drift) */
const EPSILON = 1e-10;

/**
 * Round-trip helper: notes → serialize → parse → interpret → compare to original.
 * Sorts both arrays for comparison since note order within a time group may vary.
 * Uses approximate comparison for floating-point values to handle fraction drift
 * (e.g., 1/3 vs 4/3-1 differ by 1 ULP in IEEE 754).
 * @param notes - Notes to round-trip
 * @param options - Time signature options
 * @param options.timeSigNumerator - Time signature numerator
 * @param options.timeSigDenominator - Time signature denominator
 */
function expectRoundTrip(
  notes: NoteEvent[],
  options?: { timeSigNumerator?: number; timeSigDenominator?: number },
): void {
  const formatted = formatNotation(notes, options);
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
    expect(
      Math.abs((repr.probability ?? 1) - (orig.probability ?? 1)),
    ).toBeLessThan(EPSILON);
    expect(
      Math.abs((repr.velocity_deviation ?? 0) - (orig.velocity_deviation ?? 0)),
    ).toBeLessThan(EPSILON);
  }
}

/**
 * Sort notes by start_time, then pitch for deterministic comparison
 * @param notes - Notes to sort
 * @returns Sorted copy
 */
function sortNotes(notes: NoteEvent[]): NoteEvent[] {
  return [...notes].sort((a, b) => {
    if (Math.abs(a.start_time - b.start_time) > 0.001)
      return a.start_time - b.start_time;

    return a.pitch - b.pitch;
  });
}

describe("round-trip: serialize → parse → interpret", () => {
  it("round-trips simple melody", () => {
    expectRoundTrip([
      createNote(),
      createNote({ pitch: 62, start_time: 1 }),
      createNote({ pitch: 64, start_time: 2 }),
      createNote({ pitch: 65, start_time: 3 }),
    ] as NoteEvent[]);
  });

  it("round-trips chord", () => {
    expectRoundTrip([
      createNote(),
      createNote({ pitch: 64 }),
      createNote({ pitch: 67 }),
    ] as NoteEvent[]);
  });

  it("round-trips chord progression", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 64, start_time: 0 }),
      createNote({ pitch: 67, start_time: 0 }),
      createNote({ pitch: 62, start_time: 1 }),
      createNote({ pitch: 65, start_time: 1 }),
      createNote({ pitch: 69, start_time: 1 }),
    ] as NoteEvent[]);
  });

  it("round-trips notes with velocity changes", () => {
    expectRoundTrip([
      createNote({ velocity: 80 }),
      createNote({ pitch: 62, start_time: 1, velocity: 120 }),
      createNote({ pitch: 64, start_time: 2, velocity: 60 }),
    ] as NoteEvent[]);
  });

  it("round-trips velocity range", () => {
    expectRoundTrip([
      createNote({ velocity: 80, velocity_deviation: 40 }),
      createNote({
        pitch: 62,
        start_time: 1,
        velocity: 60,
        velocity_deviation: 20,
      }),
    ] as NoteEvent[]);
  });

  it("round-trips duration changes", () => {
    expectRoundTrip([
      createNote({ duration: 0.5 }),
      createNote({ pitch: 62, start_time: 1, duration: 2 }),
      createNote({ pitch: 64, start_time: 2, duration: 0.25 }),
    ] as NoteEvent[]);
  });

  it("round-trips probability changes", () => {
    expectRoundTrip([
      createNote({ probability: 0.8 }),
      createNote({ pitch: 62, start_time: 1, probability: 0.5 }),
      createNote({ pitch: 64, start_time: 2, probability: 1.0 }),
    ] as NoteEvent[]);
  });

  it("round-trips mixed state changes", () => {
    expectRoundTrip([
      createNote({ velocity: 80, duration: 0.5, probability: 0.8 }),
      createNote({
        pitch: 62,
        start_time: 1,
        velocity: 120,
        duration: 2,
        probability: 0.6,
      }),
    ] as NoteEvent[]);
  });

  it("round-trips sub-beat timing", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 62, start_time: 0.5 }),
      createNote({ pitch: 64, start_time: 1.25 }),
      createNote({ pitch: 65, start_time: 1.75 }),
    ] as NoteEvent[]);
  });

  it("round-trips comma-merged notes", () => {
    // Same note at beats 1 and 3 — gets comma-merged in output
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ start_time: 2 }),
    ] as NoteEvent[]);
  });

  it("round-trips comma-merged chords", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 64, start_time: 0 }),
      createNote({ pitch: 67, start_time: 0 }),
      createNote({ start_time: 2 }),
      createNote({ pitch: 64, start_time: 2 }),
      createNote({ pitch: 67, start_time: 2 }),
    ] as NoteEvent[]);
  });

  it("round-trips interleaved chord pattern", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 64, start_time: 0 }),
      createNote({ pitch: 62, start_time: 1 }),
      createNote({ pitch: 65, start_time: 1 }),
      createNote({ start_time: 2 }),
      createNote({ pitch: 64, start_time: 2 }),
      createNote({ pitch: 62, start_time: 3 }),
      createNote({ pitch: 65, start_time: 3 }),
    ] as NoteEvent[]);
  });

  it("round-trips notes across bars", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 62, start_time: 4 }),
      createNote({ pitch: 64, start_time: 8 }),
    ] as NoteEvent[]);
  });

  it("round-trips with 3/4 time signature", () => {
    expectRoundTrip(
      [
        createNote({ start_time: 0 }),
        createNote({ pitch: 62, start_time: 3 }),
      ] as NoteEvent[],
      { timeSigNumerator: 3, timeSigDenominator: 4 },
    );
  });

  it("round-trips with 6/8 time signature", () => {
    expectRoundTrip(
      [
        createNote({ start_time: 0 }),
        createNote({ pitch: 62, start_time: 1.5 }),
        createNote({ pitch: 64, start_time: 3 }),
      ] as NoteEvent[],
      { timeSigNumerator: 6, timeSigDenominator: 8 },
    );
  });

  it("round-trips drum pattern fixture", () => {
    expectRoundTrip(drumPatternNotes);
  });

  it("round-trips per-note velocity in chord", () => {
    expectRoundTrip([
      createNote({ velocity: 127 }),
      createNote({ pitch: 64, velocity: 100 }),
      createNote({ pitch: 67, velocity: 80 }),
    ] as NoteEvent[]);
  });

  it("round-trips all defaults (no state changes)", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ start_time: 1 }),
      createNote({ start_time: 2 }),
      createNote({ start_time: 3 }),
    ] as NoteEvent[]);
  });

  it("round-trips from notation string", () => {
    const original = "v80-120 t/2 C3 D3 1|2.25 v120 p0.8 t2 E3 F3 1|3";
    const parsed = interpretNotation(original);
    const formatted = formatNotation(parsed);
    const reparsed = interpretNotation(formatted);

    expect(parsed).toStrictEqual(reparsed);
  });

  it("round-trips triplet-based timing", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 62, start_time: 1 / 3 }),
      createNote({ pitch: 64, start_time: 2 / 3 }),
    ] as NoteEvent[]);
  });

  it("round-trips sixteenth-note subdivisions", () => {
    expectRoundTrip([
      createNote({ duration: 0.25, start_time: 0 }),
      createNote({ duration: 0.25, start_time: 0.25 }),
      createNote({ duration: 0.25, start_time: 0.5 }),
      createNote({ duration: 0.25, start_time: 0.75 }),
    ] as NoteEvent[]);
  });
});
