// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { createTestNotes } from "../evaluator/transform-evaluator-test-helpers.ts";

// Straight notes one grid step apart for 16 bars, positioned two ways: by
// multiplying (`i * step`) and by adding up (as repeating a note does), which
// drifts a few ulps and lands on different sides of a step boundary.
function stepStarts(step: number, accumulate: boolean): number[] {
  const count = Math.round(64 / step);
  const starts: number[] = [];
  let sum = 0;

  for (let i = 0; i < count; i++) {
    starts.push(accumulate ? sum : i * step);
    sum += step;
  }

  return starts;
}

function swung(starts: number[], transform: string): number[] {
  const notes = createTestNotes(
    starts.map((start_time) => ({ start_time, duration: 0.1 })),
  );

  applyTransforms(notes, transform, 4, 4);

  return notes.map((note) => note.start_time);
}

describe("swing() on exact grid steps", () => {
  // Triplet and other non-binary grids, where `step / period` is not exact.
  it.each([
    ["n/12", 1 / 3],
    ["n/6", 2 / 3],
    ["n/24", 1 / 6],
    ["n/20", 0.2],
    ["n/10", 0.4],
    ["n/8", 0.5],
    ["n/16", 0.25],
  ])("swings exactly the off-beats on %s", (grid, step) => {
    const amount = step / 10;

    for (const accumulate of [false, true]) {
      for (const raw of ["", ", raw"]) {
        const starts = stepStarts(step, accumulate);
        const result = swung(
          starts,
          `timing = swing(${amount}, ${grid}${raw})`,
        );

        for (const [i, start] of starts.entries()) {
          expect(result[i]).toBeCloseTo(start + (i % 2 === 1 ? amount : 0), 9);
        }
      }
    }
  });

  it("moves an off-beat and not an on-beat at the indices that used to flip (n/12)", () => {
    const result = swung(stepStarts(1 / 3, false), "timing = swing(0.1, n/12)");

    expect(result[7]).toBeCloseTo(7 / 3 + 0.1, 9);
    expect(result[14]).toBeCloseTo(14 / 3, 9);
  });

  it("swings slightly off-grid triplets like exact ones (n/12)", () => {
    const exact = stepStarts(1 / 3, true);
    const played = exact.map(
      (start, i) => start + (i % 3 === 0 ? 0.03 : -0.03),
    );
    const expected = swung(exact, "timing = swing(0.1, n/12)");

    for (const [i, start] of swung(
      played,
      "timing = swing(0.1, n/12)",
    ).entries()) {
      expect(start).toBeCloseTo(expected[i] as number, 9);
    }
  });

  it("swings a triplet pickup note before the clip start", () => {
    // -1/3 is an off-beat (odd step -1), -2/3 an on-beat.
    const result = swung([-2 / 3, -1 / 3, 0], "timing = swing(0.1, n/12)");

    expect(result[0]).toBeCloseTo(-2 / 3, 9);
    expect(result[1]).toBeCloseTo(-1 / 3 + 0.1, 9);
    expect(result[2]).toBeCloseTo(0, 9);
  });
});
