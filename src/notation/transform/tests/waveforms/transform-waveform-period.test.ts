// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

/** Eight 8th notes on the beat grid. */
function eighths(count = 8): NoteEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    pitch: 68,
    start_time: i * 0.5,
    duration: 0.25,
    velocity: 100,
    probability: 1,
    velocity_deviation: 0,
  }));
}

/**
 * Run a transform, returning the velocities it wrote and the warnings it raised.
 * @param transform - Transform string to apply
 * @param notes - Notes to transform
 * @returns The resulting velocities, the transformed count, and the warnings
 */
function runTransform(
  transform: string,
  notes = eighths(),
): {
  velocities: number[];
  transformed: number | undefined;
  warnings: string[];
} {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  try {
    const transformed = applyTransforms(notes, transform, 4, 4);

    return {
      velocities: notes.map((note) => note.velocity),
      transformed,
      warnings: warn.mock.calls.map((call) => String(call[0])),
    };
  } finally {
    warn.mockRestore();
  }
}

describe("waveform period sign", () => {
  it("runs the cycle backwards for a negative period", () => {
    const forward = runTransform("velocity = 70 + 30 * sin(8)");
    const backward = runTransform("velocity = 70 + 30 * sin(-8)");

    expect(backward.warnings).toStrictEqual([]);
    expect(backward.transformed).toBe(8);

    // sin is odd, so reversing the period mirrors every non-zero sample.
    for (const [i, velocity] of backward.velocities.entries()) {
      expect(velocity).toBeCloseTo(140 - (forward.velocities[i] as number), 10);
    }

    expect(new Set(backward.velocities)).not.toStrictEqual(
      new Set(forward.velocities),
    );
  });

  it.each([
    ["-n/1", "n/1"],
    ["-2bar", "2bar"],
  ])("accepts a signed musical period (%s)", (backwardPeriod, period) => {
    const forward = runTransform(`velocity = 70 + 30 * sin(${period})`);
    const backward = runTransform(
      `velocity = 70 + 30 * sin(${backwardPeriod})`,
    );

    expect(backward.warnings).toStrictEqual([]);

    for (const [i, velocity] of backward.velocities.entries()) {
      expect(velocity).toBeCloseTo(140 - (forward.velocities[i] as number), 10);
    }
  });

  it("samples phase 0 for a zero period, with no NaN or Infinity", () => {
    const sine = runTransform("velocity = 70 + 30 * sin(0)");
    const cosine = runTransform("velocity = 70 + 30 * cos(0)");

    expect(sine.warnings).toStrictEqual([]);
    expect(sine.velocities).toStrictEqual(Array.from({ length: 8 }, () => 70));
    expect(cosine.velocities).toStrictEqual(
      Array.from({ length: 8 }, () => 100),
    );
  });

  it.each(["cos", "sin", "tri", "saw", "square"])(
    "keeps %s in [-1, 1] at a negative period",
    (name) => {
      const { velocities, warnings } = runTransform(
        `velocity = 70 + 30 * ${name}(-3)`,
      );

      expect(warnings).toStrictEqual([]);

      for (const velocity of velocities) {
        expect(velocity).toBeGreaterThanOrEqual(40);
        expect(velocity).toBeLessThanOrEqual(100);
      }
    },
  );
});

describe("waveform phase offset", () => {
  it("applies a per-note offset without warning", () => {
    const { velocities, transformed, warnings } = runTransform(
      "velocity = 70 + 30 * sin(1bar, note.start)",
    );

    expect(warnings).toStrictEqual([]);
    expect(transformed).toBe(8);
    expect(new Set(velocities).size).toBeGreaterThan(1);
  });
});

describe("flat waveform results", () => {
  it("writes the same value to every note, quietly", () => {
    // A period that divides the note spacing samples one phase per note. That
    // is a legitimate result, so it lands like any other assignment.
    const { velocities, transformed, warnings } = runTransform(
      "velocity = 70 + 30 * sin(1)",
      eighths(4).map((note, i) => ({ ...note, start_time: i })),
    );

    expect(warnings).toStrictEqual([]);
    expect(transformed).toBe(4);
    expect(velocities).toStrictEqual([70, 70, 70, 70]);
  });

  it("adds a constant offset for a flat `+=`", () => {
    const { velocities, warnings } = runTransform(
      "velocity += 10 * cos(1)",
      eighths(4).map((note, i) => ({ ...note, start_time: i })),
    );

    expect(warnings).toStrictEqual([]);
    expect(velocities).toStrictEqual([110, 110, 110, 110]);
  });
});
