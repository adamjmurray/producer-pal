// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { createTestNotes } from "../evaluator/transform-evaluator-test-helpers.ts";

// Straight notes every `step` beats over two 4/4 bars.
function straightNotes(step: number): NoteEvent[] {
  return createTestNotes(
    Array.from({ length: 8 / step }, (_, i) => ({
      start_time: i * step,
      duration: step,
    })),
  );
}

function startsAfter(step: number, ...transforms: string[]): number[] {
  const notes = straightNotes(step);

  for (const transform of transforms) {
    applyTransforms(notes, transform, 4, 4);
  }

  return notes.map((note) => note.start_time);
}

// swing() snaps notes to grid/4 before delaying them, so a swung note snaps back
// to its off-beat only while the old amount is under half that step: grid/8.
describe("re-applying swing() with a new amount", () => {
  it.each([
    [0.02, "n/8", 0.5],
    [0.05, "n/8", 0.5],
    [0.02, "n/16", 0.25],
    [0.03, "n/16", 0.25],
    [-0.05, "n/8", 0.5],
  ])(
    "matches swinging the straight notes once (first amount %s, %s)",
    (first, grid, step) => {
      const once = startsAfter(step, `timing = swing(0.03, ${grid})`);
      const twice = startsAfter(
        step,
        `timing = swing(${first}, ${grid})`,
        `timing = swing(0.03, ${grid})`,
      );

      for (const [i, start] of once.entries()) {
        expect(twice[i]).toBeCloseTo(start, 10);
      }
    },
  );

  // Known limit, not tested: an old amount of grid/8 or more (0.0625 for n/8, so
  // even "heavy" 0.1) snaps to the wrong step, and one of 7/8 of the grid or more
  // (0.4375 for n/8) lands on the next beat and collapses onto it.
});
