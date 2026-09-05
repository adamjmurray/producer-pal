// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { findWaveformName } from "#src/notation/transform/helpers/transform-flat-waveform-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

/** Eight 8th notes on the beat grid — the spacing that makes `sin(1)` flat. */
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
 * Run a transform and return the flat-LFO warnings it raised.
 * @param transform - Transform string to apply
 * @param notes - Notes to transform
 * @returns Warning messages mentioning a flat LFO
 */
function flatWarnings(transform: string, notes = eighths()): string[] {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  try {
    applyTransforms(notes, transform, 4, 4);

    return warn.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes("flat LFO"));
  } finally {
    warn.mockRestore();
  }
}

describe("flat waveform detection", () => {
  it("warns when a period divides the note spacing", () => {
    const warnings = flatWarnings("velocity = 70 + 30 * sin(1)");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("all 8 notes the same value");
    expect(warnings[0]).toContain("period in beats");
  });

  it("warns when a phase expression is passed as the period", () => {
    // `start / (start * k)` is `1/k` for every note, so the phase never moves.
    // The first note also errors (period 0), leaving 7 transformed.
    const warnings = flatWarnings(
      "velocity = 70 + 30 * sin(note.start * 3.14159)",
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("all 7 notes the same value");
  });

  it("warns when a second argument cancels the period", () => {
    expect(
      flatWarnings("velocity = 70 + 30 * sin(1, note.start)"),
    ).toHaveLength(1);
  });

  it("stays quiet for a period that actually varies the notes", () => {
    expect(flatWarnings("velocity = 70 + 30 * sin(2bar)")).toStrictEqual([]);
    expect(flatWarnings("velocity = 70 + 30 * sin(2)")).toStrictEqual([]);
  });

  it("stays quiet for a constant with no waveform in it", () => {
    expect(flatWarnings("velocity = 100")).toStrictEqual([]);
  });

  it("stays quiet when only one note is selected", () => {
    expect(
      flatWarnings("velocity = 70 + 30 * sin(1)", eighths(1)),
    ).toStrictEqual([]);
  });

  it("finds every waveform the evaluator dispatches, however nested", () => {
    for (const name of ["cos", "sin", "tri", "saw", "square"]) {
      const notes = eighths();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      applyTransforms(notes, `velocity = 70 + 30 * ${name}(2bar)`, 4, 4);
      warn.mockRestore();

      // A name the evaluator accepts but this module doesn't know would leave
      // the notes untouched here only by accident, so assert the walk directly.
      expect(
        findWaveformName({
          type: "multiply",
          left: 30,
          right: { type: "function", name, args: [2], sync: false, raw: false },
        }),
      ).toBe(name);
    }
  });

  it("returns null for expressions with no waveform", () => {
    expect(findWaveformName(60)).toBeNull();
    expect(
      findWaveformName({ type: "variable", namespace: "note", name: "index" }),
    ).toBeNull();
    expect(
      findWaveformName({
        type: "function",
        name: "rand",
        args: [1],
        sync: false,
        raw: false,
      }),
    ).toBeNull();
  });
});
