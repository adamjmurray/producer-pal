// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { createTestNotes } from "./transform-evaluator-test-helpers.ts";

describe("next.* variables", () => {
  it("accesses next note start time", () => {
    const notes = createTestNotes([
      { start_time: 0 },
      { start_time: 1 },
      { start_time: 2 },
    ]);

    applyTransforms(notes, "duration = next.start - note.start", 4, 4);

    // The first two notes each measure a gap of 1 to their next note. The last
    // note has no next note, so its assignment is skipped and it keeps the
    // original default duration.
    expectDurations(notes, [1, 1, 1]);
  });

  it("accesses all next note properties", () => {
    const notes = createTestNotes([
      {
        pitch: 60,
        start_time: 0,
        velocity: 80,
        duration: 0.5,
        probability: 0.5,
        velocity_deviation: 10,
      },
      {
        pitch: 72,
        start_time: 2,
        velocity: 120,
        duration: 1.5,
        probability: 0.8,
        velocity_deviation: -20,
      },
    ]);

    applyTransforms(notes, "velocity = next.pitch", 4, 4);
    expect(notes[0]!.velocity).toBe(72);

    // Reset and test next.velocity
    notes[0]!.velocity = 80;
    notes[1]!.velocity = 120;
    applyTransforms(notes, "velocity = next.velocity", 4, 4);
    expect(notes[0]!.velocity).toBe(120);

    // Test next.duration
    applyTransforms(notes, "duration = next.duration", 4, 4);
    expect(notes[0]!.duration).toBe(1.5);

    // Test next.probability
    applyTransforms(notes, "probability = next.probability", 4, 4);
    expect(notes[0]!.probability).toBe(0.8);

    // Test next.deviation
    applyTransforms(notes, "deviation = next.deviation", 4, 4);
    expect(notes[0]!.velocity_deviation).toBe(-20);
  });

  it("skips last note with warning when using next.*", () => {
    const warn = vi.spyOn(console, "warn");
    const notes = createTestNotes([
      { start_time: 0, velocity: 80 },
      { start_time: 1, velocity: 100 },
    ]);

    applyTransforms(notes, "velocity = next.velocity", 4, 4);

    expect(notes[0]!.velocity).toBe(100); // got next note's velocity
    expect(notes[1]!.velocity).toBe(100); // unchanged (skipped)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("next.velocity"));
  });

  it("respects pitch-range filtering for next note", () => {
    const notes = createTestNotes([
      { pitch: 48, start_time: 0 }, // C2 — filtered in
      { pitch: 60, start_time: 1 }, // C4 — filtered out
      { pitch: 50, start_time: 2 }, // D2 — filtered in
    ]);

    applyTransforms(notes, "C2-D2: duration = next.start - note.start", 4, 4);

    // C2's next in the filtered set is D2 at t=2, not C4 at t=1
    expect(notes[0]!.duration).toBe(2);
    // C4 unaffected (outside pitch range)
    expect(notes[1]!.duration).toBe(1);
    // D2 is last in filtered set — skipped
    expect(notes[2]!.duration).toBe(1);
  });

  it("scopes the next note to the time-selected subset", () => {
    // The selector defines the working set, so next.* points at the next
    // SELECTED note, not the next note in the clip. Window 2|1-<2|3 (beats 4-6)
    // picks the notes at starts 4 and 5; the note at 8 is outside it. The note
    // at 5 is the last selected one — it has no next-in-selection and is
    // skipped, rather than reaching past the window to the note at 8.
    const warn = vi.spyOn(console, "warn");
    const notes = createTestNotes([
      { start_time: 4 },
      { start_time: 5 },
      { start_time: 8 },
    ]);

    applyTransforms(
      notes,
      "2|1-<2|3: duration = next.start - note.start",
      4,
      4,
    );

    // The note at 4 measures 5 - 4 = 1. The note at 5 is the last selected one
    // — skipped, so its default is kept. The note at 8 is outside the window
    // and untouched.
    expectDurations(notes, [1, 1, 1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("next.start"));
  });

  it("reflects mutations from earlier transforms", () => {
    const notes = createTestNotes([
      { start_time: 0, velocity: 80 },
      { start_time: 1, velocity: 100 },
    ]);

    // First assignment mutates all velocities to 50, then second reads next.velocity
    applyTransforms(notes, "velocity = 50\nvelocity = next.velocity", 4, 4);

    // After first assignment: both notes velocity=50
    // Second assignment: note[0] gets next.velocity=50 (mutated), note[1] skipped
    expect(notes[0]!.velocity).toBe(50);
    expect(notes[1]!.velocity).toBe(50);
  });

  it("works in arithmetic expressions", () => {
    const notes = createTestNotes([
      { start_time: 0, velocity: 80 },
      { start_time: 1, velocity: 40 },
    ]);

    applyTransforms(
      notes,
      "velocity = (note.velocity + next.velocity) / 2",
      4,
      4,
    );

    expect(notes[0]!.velocity).toBe(60); // average of 80 and 40
  });
});

describe("legato()", () => {
  it("sets duration to gap between consecutive notes", () => {
    const notes = createTestNotes([
      { start_time: 0, duration: 0.25 },
      { start_time: 1.5, duration: 0.25 },
      { start_time: 3, duration: 0.25 },
    ]);

    applyTransforms(notes, "duration = legato()", 4, 4);

    expect(notes[0]!.duration).toBe(1.5);
    expect(notes[1]!.duration).toBe(1.5);
    // Last note keeps its current duration (no next note, no clip end)
    expect(notes[2]!.duration).toBe(0.25);
  });

  it("keeps last note's current duration without clip context, with a warning", () => {
    const warn = vi.spyOn(console, "warn");
    const notes = createTestNotes([{ start_time: 0 }, { start_time: 2 }]);

    applyTransforms(notes, "duration = legato()", 4, 4);

    expect(notes[0]!.duration).toBe(2);
    expect(notes[1]!.duration).toBe(1); // kept current duration
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("keeping current duration"),
    );
  });

  it("extends last note to clip end with clip context", () => {
    const durations = legatoDurationsInFourBeatClip();

    expect(durations[0]).toBe(2);
    expect(durations[1]).toBe(2); // extended to clip end (4 - 2 = 2)
  });

  it("extends last note to clip end using clip-local length on arrangement clips", () => {
    // Note start_times are clip-relative, so clipEnd must be the clip-local
    // length (clipDuration), NOT arrangementStart + clipDuration. With a
    // non-null arrangementStart, the buggy absolute clipEnd would inflate the
    // last note's duration by arrangementStart (here: 16 + 4 - 2 = 18).
    const durations = legatoDurationsInFourBeatClip({ arrangementStart: 16 });

    expect(durations[0]).toBe(2);
    expect(durations[1]).toBe(2); // clip-local: 4 - 2 = 2 (not 18)
  });

  it("skips chord tones at same start time", () => {
    const notes = createTestNotes([
      { pitch: 60, start_time: 0, duration: 0.25 },
      { pitch: 64, start_time: 0, duration: 0.25 },
      { pitch: 67, start_time: 0, duration: 0.25 },
      { pitch: 60, start_time: 2, duration: 0.25 },
    ]);

    applyTransforms(notes, "duration = legato()", 4, 4);

    // All three chord tones at t=0 should extend to t=2
    expect(notes[0]!.duration).toBe(2);
    expect(notes[1]!.duration).toBe(2);
    expect(notes[2]!.duration).toBe(2);
    // Last note unchanged (skipped)
    expect(notes[3]!.duration).toBe(0.25);
  });

  it("respects pitch-range filtering", () => {
    const notes = createTestNotes([
      { pitch: 48, start_time: 0, duration: 0.25 },
      { pitch: 60, start_time: 1, duration: 0.25 },
      { pitch: 50, start_time: 2, duration: 0.25 },
    ]);

    applyTransforms(notes, "C2-D2: duration = legato()", 4, 4);

    // C2's next in filtered set is D2 at t=2
    expect(notes[0]!.duration).toBe(2);
    // C4 unaffected
    expect(notes[1]!.duration).toBe(0.25);
    // D2 is last — skipped
    expect(notes[2]!.duration).toBe(0.25);
  });

  it("rejects more than 1 argument", () => {
    const warn = vi.spyOn(console, "warn");
    const notes = createTestNotes([{ start_time: 0 }, { start_time: 1 }]);

    applyTransforms(notes, "duration = legato(0.1, 0.2)", 4, 4);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("legato()"));
    // Notes unchanged
    expect(notes[0]!.duration).toBe(1);
  });

  it("groups humanized chord tones with tolerance", () => {
    const notes = createTestNotes([
      { pitch: 60, start_time: 0, duration: 0.25 },
      { pitch: 64, start_time: 0.04, duration: 0.25 },
      { pitch: 67, start_time: 0.08, duration: 0.25 },
      { pitch: 60, start_time: 2, duration: 0.25 },
    ]);

    applyTransforms(notes, "duration = legato(0.1)", 4, 4);

    // All three chord tones (within 0.1 of each other) extend to t=2
    expect(notes[0]!.duration).toBeCloseTo(2);
    expect(notes[1]!.duration).toBeCloseTo(1.96);
    expect(notes[2]!.duration).toBeCloseTo(1.92);
    // Last note unchanged (no clip context)
    expect(notes[3]!.duration).toBe(0.25);
  });

  it("does not group notes beyond tolerance", () => {
    const notes = createTestNotes([
      { start_time: 0, duration: 0.25 },
      { start_time: 0.5, duration: 0.25 },
      { start_time: 2, duration: 0.25 },
    ]);

    applyTransforms(notes, "duration = legato(0.1)", 4, 4);

    // 0 and 0.5 are beyond tolerance — treated as distinct
    expect(notes[0]!.duration).toBe(0.5);
    expect(notes[1]!.duration).toBe(1.5);
  });

  it("legato(0) behaves same as legato()", () => {
    const notes = createTestNotes([
      { pitch: 60, start_time: 0, duration: 0.25 },
      { pitch: 64, start_time: 0, duration: 0.25 },
      { pitch: 60, start_time: 2, duration: 0.25 },
    ]);

    applyTransforms(notes, "duration = legato(0)", 4, 4);

    expect(notes[0]!.duration).toBe(2);
    expect(notes[1]!.duration).toBe(2);
  });
});

/**
 * Asserts every note's duration, in order. Compares the whole sequence at once
 * so a mismatch reports the full shape (and the note count) rather than only
 * the first failing index.
 *
 * @param notes - The notes to check
 * @param expected - The expected duration of each note, in order
 */
function expectDurations(notes: NoteEvent[], expected: number[]): void {
  expect(notes.map((note) => note.duration)).toStrictEqual(expected);
}

/**
 * Runs `duration = legato()` in 4/4 over two notes two beats apart (starts 0
 * and 2) inside a one-bar, 4-beat clip, and returns the resulting durations.
 * The first note legatos to the second (duration 2); the last note has no next
 * note, so it stretches to the clip end (4 - 2 = 2).
 *
 * @param clipContextOverrides - Fields layered onto the standard single-clip
 *   4-beat context, e.g. `{ arrangementStart: 16 }` for an arrangement clip
 * @returns Each note's duration after the transform, in order
 */
function legatoDurationsInFourBeatClip(
  clipContextOverrides: Partial<ClipContext> = {},
): (number | undefined)[] {
  const notes = createTestNotes([
    { start_time: 0, duration: 0.25 },
    { start_time: 2, duration: 0.25 },
  ]);
  const clipContext: ClipContext = {
    clipDuration: 4,
    clipIndex: 0,
    clipCount: 1,
    barDuration: 4,
    ...clipContextOverrides,
  };

  applyTransforms(notes, "duration = legato()", 4, 4, clipContext);

  return notes.map((note) => note.duration);
}
