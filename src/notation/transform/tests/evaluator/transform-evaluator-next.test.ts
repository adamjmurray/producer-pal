// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { createTestNotes } from "./transform-evaluator-test-helpers.ts";

describe("next.* variables", () => {
  it("accesses next note start time", () => {
    const notes = createTestNotes([
      { start_time: 0 },
      { start_time: 1 },
      { start_time: 2 },
    ]);

    applyTransforms(notes, "duration = next.start - note.start", 4, 4);

    expect(notes[0]!.duration).toBe(1);
    expect(notes[1]!.duration).toBe(1);
    // Last note unchanged (assignment skipped)
    expect(notes[2]!.duration).toBe(1); // original default
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
    // Last note unchanged (skipped)
    expect(notes[2]!.duration).toBe(0.25);
  });

  it("skips last note with warning", () => {
    const warn = vi.spyOn(console, "warn");
    const notes = createTestNotes([{ start_time: 0 }, { start_time: 2 }]);

    applyTransforms(notes, "duration = legato()", 4, 4);

    expect(notes[0]!.duration).toBe(2);
    expect(notes[1]!.duration).toBe(1); // unchanged
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("legato()"));
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

  it("rejects arguments", () => {
    const warn = vi.spyOn(console, "warn");
    const notes = createTestNotes([{ start_time: 0 }, { start_time: 1 }]);

    applyTransforms(notes, "duration = legato(1)", 4, 4);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("legato()"));
    // Notes unchanged
    expect(notes[0]!.duration).toBe(1);
  });
});
