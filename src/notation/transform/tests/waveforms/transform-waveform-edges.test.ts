// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { square, saw } from "#src/notation/transform/transform-waveforms.ts";

// Notes a quarter-period apart, positioned by multiplying and by adding up (as
// repeating a note does). Either drifts a few ulps off the exact edge.
function quarterPeriodNotes(
  period: number,
  count: number,
  accumulate: boolean,
): NoteEvent[] {
  const step = period / 4;
  let sum = 0;

  return Array.from({ length: count }, (_, i) => {
    const start_time = accumulate ? sum : i * step;

    sum += step;

    return {
      pitch: 60,
      start_time,
      duration: 0.1,
      velocity: 100,
      probability: 1,
    };
  });
}

function levels(expression: string, period: number, accumulate: boolean) {
  const notes = quarterPeriodNotes(period, 64, accumulate);

  applyTransforms(notes, `velocity = 64 + 60 * ${expression}`, 4, 4);

  return notes.map((note) => (note.velocity - 64) / 60);
}

describe("square() and saw() on exact cycle edges", () => {
  // Non-binary periods, where `position / period` is not exact.
  const periods: [string, number][] = [
    ["n/12", 1 / 3],
    ["n/6", 2 / 3],
    ["n/24", 1 / 6],
    ["n/20", 0.2],
    ["n/10", 0.4],
  ];

  it.each(periods)(
    "square(%s) flips exactly at the pulse edges",
    (name, period) => {
      for (const accumulate of [false, true]) {
        for (const [width, high] of [
          [0.25, 1],
          [0.5, 2],
          [0.75, 3],
        ] as const) {
          const result = levels(
            `square(${name}, 0, ${width})`,
            period,
            accumulate,
          );

          for (const [i, value] of result.entries()) {
            expect(value).toBeCloseTo(i % 4 < high ? 1 : -1, 9);
          }
        }
      }
    },
  );

  it.each(periods)("square(%s) starts each cycle high", (name, period) => {
    for (const accumulate of [false, true]) {
      for (const [i, value] of levels(
        `square(${name})`,
        period,
        accumulate,
      ).entries()) {
        expect(value).toBeCloseTo(i % 4 < 2 ? 1 : -1, 9);
      }
    }
  });

  it.each(periods)("saw(%s) jumps exactly at half a cycle", (name, period) => {
    for (const accumulate of [false, true]) {
      for (const [i, value] of levels(
        `saw(${name})`,
        period,
        accumulate,
      ).entries()) {
        expect(value).toBeCloseTo([0, 0.5, -1, -0.5][i % 4] as number, 9);
      }
    }
  });

  it("leaves the plain waveform functions exact without a tolerance", () => {
    expect(square(0.5)).toBe(-1);
    expect(square(0.4999999999)).toBe(1);
    expect(square(0.9999999999)).toBe(-1);
    expect(saw(0.4999999999)).toBeCloseTo(1, 9);
  });
});
