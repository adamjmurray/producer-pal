// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MeterDependentArgError } from "#src/notation/transform/helpers/note-ops/transform-arg-errors.ts";
import {
  applyTransforms,
  tryParseTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { createTestNote } from "../evaluator/transform-evaluator-test-helpers.ts";

const BASE = "swing amount is a delay in beats and must be under the grid";

describe("a swing() amount at or past its grid", () => {
  it.each([
    ["timing = swing(0.5, n/8)", `${BASE} (0.5 beats); for 50% swing, use 0`],
    [
      "timing = swing(0.56, n/8)",
      `${BASE} (0.5 beats); for 56% swing, use 0.06`,
    ],
    ["timing = swing(0.56)", `${BASE} (0.5 beats); for 56% swing, use 0.06`],
    [
      "timing = swing(0.75, n/8)",
      `${BASE} (0.5 beats); for 75% swing, use 0.25`,
    ],
    ["timing = swing(56, n/8)", `${BASE} (0.5 beats); for 56% swing, use 0.06`],
    ["timing = swing(66, n/8)", `${BASE} (0.5 beats); for 66% swing, use 0.16`],
    [
      "timing = swing(0.56, n/16)",
      `${BASE} (0.25 beats); for 56% swing, use 0.03`,
    ],
    ["timing = swing(0.3, n/16)", `${BASE} (0.25 beats)`],
    ["timing = swing(0.8, n/8)", BASE + " (0.5 beats)"],
    ["timing = swing(1)", `${BASE} (0.5 beats)`],
    ["timing = swing(76, n/8)", `${BASE} (0.5 beats)`],
    ["timing = swing(49, n/8)", `${BASE} (0.5 beats)`],
    ["timing = swing(-0.5)", `${BASE} (0.5 beats)`],
    ["timing = swing(-0.56)", `${BASE} (0.5 beats)`],
    ["timing = swing(-0.7, n/8)", `${BASE} (0.5 beats)`],
    ["timing = swing(0.1, 0.1)", `${BASE} (0.1 beats)`],
    ["timing = swing(0.5 + 0.1, n/8, raw)", `${BASE} (0.5 beats)`],
    ["C3: timing = swing(0.6)", `${BASE} (0.5 beats)`],
    ["timing = 1 * swing(0.6)", `${BASE} (0.5 beats)`],
  ])("is refused: %s", (transform, message) => {
    expect(() => tryParseTransform(transform, 4, 4)).toThrow(message);
  });

  it("is refused before any note changes", () => {
    const notes = createTestNote({ start_time: 0.5 });

    expect(() => applyTransforms(notes, "timing = swing(0.56)", 4, 4)).toThrow(
      "for 56% swing, use 0.06",
    );
    expect(notes[0]?.start_time).toBe(0.5);
  });

  it("names the default grid in beats, which is half the meter's beat in any meter", () => {
    for (const [numerator, denominator] of [
      [4, 4],
      [6, 8],
    ] as const) {
      expect(() =>
        tryParseTransform("timing = swing(0.6)", denominator, numerator),
      ).toThrow(`${BASE} (0.5 beats)`);
    }
  });

  it("is refused in every meter when amount and grid are plain numbers", () => {
    for (const [numerator, denominator] of [
      [4, 4],
      [6, 8],
    ] as const) {
      expect(() =>
        tryParseTransform("timing = swing(0.3, 0.2)", denominator, numerator),
      ).toThrow(BASE);
    }
  });

  it("fails only the clips it is bad in when the grid is a note value", () => {
    // n/8 is 0.5 beats in 4/4 but 1 beat in x/8.
    let error: unknown;

    try {
      tryParseTransform("timing = swing(0.6, n/8)", 4, 4);
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(MeterDependentArgError);
    expect(() =>
      tryParseTransform("timing = swing(0.6, n/8)", 8, 6),
    ).not.toThrow();
  });

  it("is checked as the notes run when the amount is not a constant", () => {
    const notes = createTestNote({ start_time: 0.5 });

    expect(() =>
      tryParseTransform("timing = swing(note.pitch / 100)", 4, 4),
    ).not.toThrow();

    applyTransforms(notes, "timing = swing(note.pitch / 100)", 4, 4);

    expect(notes[0]?.start_time).toBe(0.5);
    expect(capturedWarnings().join("\n")).toContain(
      `${BASE} (0.5 beats); for 60% swing, use 0.1`,
    );
  });

  it("leaves a zero or negative grid to swing()'s own message", () => {
    expect(() => tryParseTransform("timing = swing(1, 0)", 4, 4)).not.toThrow();
  });

  it("is not judged in an audio transform, which has no swing grid to check", () => {
    expect(() =>
      tryParseTransform("gain = swing(0.6, n/8)", 4, undefined, "audio"),
    ).not.toThrow();
  });
});

describe("a swing() amount under its grid", () => {
  it.each([
    "timing = swing(0.05)",
    "timing = swing(0.1, n/8)",
    "timing = swing(0.49, n/8)",
    "timing = swing(-0.49)",
    "timing = swing(0.2, n/16)",
    "timing = swing(0.6, n/4)",
    "timing = swing(0.6, n/8 * 2)",
    "timing = swing(0, n/8)",
    "timing = swing(0.4, n/8, raw)",
    "timing = swing(0.6, 1)",
  ])("still works: %s", (transform) => {
    expect(() => tryParseTransform(transform, 4, 4)).not.toThrow();
  });

  it("swings the off-beat by the amount", () => {
    const notes = createTestNote({ start_time: 0.5 });

    applyTransforms(notes, "timing = swing(0.49, n/8)", 4, 4);

    expect(notes[0]?.start_time).toBeCloseTo(0.99, 10);
  });

  it("takes a percent-looking amount when the grid is long enough", () => {
    expect(() =>
      tryParseTransform("timing = swing(0.6, n/2)", 4, 4),
    ).not.toThrow();
  });
});
