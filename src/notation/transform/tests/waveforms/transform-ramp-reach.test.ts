// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

/** Eight 16th-note hats filling beats 3 and 4 of bar 2. */
function hats(): NoteEvent[] {
  return Array.from({ length: 8 }, (_, i) => ({
    pitch: 68,
    start_time: 6 + i * 0.25,
    duration: 0.25,
    velocity: 100,
    probability: 1,
    velocity_deviation: 0,
  }));
}

/**
 * Run a transform and return both the ramp-reach warnings and the notes.
 * @param transform - Transform string to apply
 * @param notes - Notes to transform
 * @returns The warnings mentioning the shortfall, and the transformed notes
 */
function reachWarnings(
  transform: string,
  notes = hats(),
): { warnings: string[]; notes: NoteEvent[] } {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  try {
    applyTransforms(notes, transform, 4, 4);

    return {
      warnings: warn.mock.calls
        .map((call) => String(call[0]))
        .filter((message) => message.includes("of the way to its end value")),
      notes,
    };
  } finally {
    warn.mockRestore();
  }
}

describe("ramp reach detection", () => {
  it("warns when the range ends past the last note, and names the fix", () => {
    const { warnings, notes } = reachWarnings(
      "2|3-3|1: velocity = ramp(1, 127)",
    );

    // The whole point: every note matched, and the ramp still fell short.
    expect(notes.at(-1)?.velocity).toBeCloseTo(111.25);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ramp() only got 88%");
    expect(warnings[0]).toContain("(2|4.75)");
  });

  it("warns on the half-open spelling too", () => {
    // `-<3|1` selects the same notes as `-3|1`, so it falls just as short.
    const { warnings } = reachWarnings("2|3-<3|1: velocity = ramp(1, 127)");

    expect(warnings).toHaveLength(1);
  });

  it("stays quiet when the range ends on the last note", () => {
    const { warnings, notes } = reachWarnings(
      "2|3-2|4.75: velocity = ramp(1, 127)",
    );

    expect(notes.at(-1)?.velocity).toBe(127);
    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet for a round bound one grid step long", () => {
    // `1|1-3|1` leaves 3% of the range unused — the ordinary cost of a round
    // bound, not the mistake this warns about.
    const { warnings } = reachWarnings("1|1-3|1: velocity = ramp(1, 127)", [
      ...Array.from({ length: 8 }, (_, i) => ({
        pitch: 68,
        start_time: i * 0.25,
        duration: 0.25,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      })),
      {
        pitch: 68,
        start_time: 7.75,
        duration: 0.25,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      },
    ]);

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet with no range selector", () => {
    // Unscoped the range is the clip, and falling one note short of the clip
    // end is unavoidable — warning would fire on every whole-clip ramp.
    const { warnings } = reachWarnings("velocity = ramp(1, 127)");

    expect(warnings).toStrictEqual([]);
  });

  it("warns for curve() as well", () => {
    const { warnings } = reachWarnings("2|3-3|1: velocity = curve(1, 127, 2)");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("curve()");
  });

  it("stays quiet for a non-ramp expression", () => {
    const { warnings } = reachWarnings("2|3-3|1: velocity = 64");

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet when the range matched a single note", () => {
    // One note is always at some single phase; there is no shortfall to report.
    const { warnings } = reachWarnings("2|3-3|1: velocity = ramp(1, 127)", [
      {
        pitch: 68,
        start_time: 6,
        duration: 0.25,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      },
    ]);

    expect(warnings).toStrictEqual([]);
  });
});
