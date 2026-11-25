// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";

/**
 * Quarter notes at the given beats.
 * @param starts - Start times in beats
 * @returns The notes
 */
function notesAt(...starts: number[]): NoteEvent[] {
  return starts.map((start_time) => ({
    pitch: 60,
    start_time,
    duration: 1,
    velocity: 100,
    probability: 1,
    velocity_deviation: 0,
  }));
}

/**
 * A clip context for a 4/4 clip.
 * @param region - Region fields to set
 * @returns The context
 */
function clip(region: Partial<ClipContext>): ClipContext {
  return {
    clipDuration: 16,
    clipIndex: 0,
    clipCount: 1,
    barDuration: 4,
    ...region,
  };
}

describe("unscoped ramp() and curve() span the clip", () => {
  it("ramps over the clip, not over the notes in it", () => {
    // Notes fill bar 2 of a 4-bar clip.
    const notes = notesAt(4, 5, 6, 7);

    applyTransforms(notes, "velocity = ramp(16, 176)", 4, 4, clip({}));

    expect(notes.map((n) => n.velocity)).toStrictEqual([56, 66, 76, 86]);
  });

  it("starts at the region's start when it isn't beat 0", () => {
    // A region over bars 3-4: start marker at beat 8, end at beat 16.
    const notes = notesAt(8, 12);

    applyTransforms(
      notes,
      "velocity = ramp(10, 110)",
      4,
      4,
      clip({ clipDuration: 8, startMarker: 8, clipEnd: 16 }),
    );

    expect(notes.map((n) => n.velocity)).toStrictEqual([10, 60]);
  });

  it("curves over the clip too", () => {
    const notes = notesAt(8);

    applyTransforms(notes, "velocity = curve(1, 101, 2)", 4, 4, clip({}));

    expect(notes[0]?.velocity).toBe(26);
  });

  it("uses the same span for a where() predicate", () => {
    const notes = notesAt(4, 12);

    applyTransforms(
      notes,
      "where(ramp(0, 100) > 50): velocity = 1",
      4,
      4,
      clip({}),
    );

    expect(notes.map((n) => n.velocity)).toStrictEqual([100, 1]);
  });

  it("falls back to the notes' span when the region is empty", () => {
    const notes = notesAt(4, 5, 6, 7);

    applyTransforms(
      notes,
      "velocity = ramp(10, 110)",
      4,
      4,
      clip({ clipDuration: 0 }),
    );

    expect(notes.map((n) => n.velocity)).toStrictEqual([10, 35, 60, 85]);
  });

  it("falls back to the notes' span with no clip context", () => {
    const notes = notesAt(4, 5, 6, 7);

    applyTransforms(notes, "velocity = ramp(10, 110)", 4, 4);

    expect(notes.map((n) => n.velocity)).toStrictEqual([10, 35, 60, 85]);
  });
});
