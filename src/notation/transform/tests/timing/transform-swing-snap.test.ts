// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { createTestNotes } from "../evaluator/transform-evaluator-test-helpers.ts";

function swung(startTimes: number[], ...transforms: string[]): number[] {
  const notes = createTestNotes(
    startTimes.map((start_time) => ({ start_time, duration: 0.125 })),
  );

  for (const transform of transforms) {
    applyTransforms(notes, transform, 4, 4);
  }

  return notes.map((note) => note.start_time);
}

// swing() snaps every note to grid/4 (round to nearest) before delaying it.
// Pinned so a change to the snap can't quietly break input that isn't
// grid-exact, or notes finer than the swing grid.
describe("swing() auto-quantize snap", () => {
  const eighths = Array.from({ length: 16 }, (_, i) => i * 0.5);
  const expected = swung(eighths, "timing = swing(0.05)");

  it.each([-0.06, -0.03, -0.01, 0.01, 0.03, 0.06])(
    "pulls 8th notes played %s beats off back to the grid before swinging",
    (offset) => {
      // Early on-beats and late off-beats both matter here.
      const played = eighths.map((start) => start + offset);

      for (const [i, start] of swung(
        played,
        "timing = swing(0.05)",
      ).entries()) {
        expect(start).toBeCloseTo(expected[i] as number, 10);
      }
    },
  );

  it("keeps 32nd notes distinct after an early drift", () => {
    const roll = [0.5, 0.625, 0.75, 0.875].map((start) => start - 0.01);

    const result = swung(roll, "timing = swing(0.05)");

    for (const [i, start] of [0.55, 0.675, 0.8, 0.925].entries()) {
      expect(result[i]).toBeCloseTo(start, 10);
    }
  });

  it("is undone for an old amount up to half the grid by quant(<grid>) first", () => {
    const once = swung(eighths, "timing = swing(0.05)");
    const twice = swung(
      eighths,
      "timing = swing(0.2)",
      "timing = quant(n/8)",
      "timing = swing(0.05)",
    );

    for (const [i, start] of once.entries()) {
      expect(twice[i]).toBeCloseTo(start, 10);
    }
  });
});
