// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as maxConsole from "#src/shared/max/v8-max-console.ts";

/**
 * 16th-note hats on a quarter-note grid starting at bar 2 beat 3.
 * @param count - How many hats
 * @returns The notes, the last one at beat 3 + (count - 1) / 4
 */
function hats(count: number): NoteEvent[] {
  return Array.from({ length: count }, (_, i) => ({
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
  notes = hats(7),
): { warnings: string[]; notes: NoteEvent[] } {
  const warn = vi.spyOn(maxConsole, "emitWarning").mockImplementation(() => {});

  try {
    applyTransforms(notes, transform, 4, 4);

    return {
      warnings: warn.mock.calls
        .map((call) => String(call[0]))
        .filter((message) => message.includes("of its end value")),
      notes,
    };
  } finally {
    warn.mockRestore();
  }
}

describe("ramp reach detection", () => {
  // Seven hats stop at 2|4.5, half a beat before a `3|1` range end — two grid
  // steps of the range go unused, so the ramp never reaches 127.
  it("warns when the range ends past the last note, and names the fix", () => {
    const { warnings, notes } = reachWarnings(
      "2|3-3|1: velocity = ramp(1, 127)",
    );

    // The whole point: every note matched, and the ramp still fell short.
    expect(notes.at(-1)?.velocity).toBeLessThan(127);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ramp() only reached 75%");
    expect(warnings[0]).toContain("(2|4.5)");
  });

  it("warns on the half-open spelling too", () => {
    // `-<3|1` selects the same notes as `-3|1`, so it falls just as short.
    const { warnings } = reachWarnings("2|3-<3|1: velocity = ramp(1, 127)");

    expect(warnings).toHaveLength(1);
  });

  it("stays quiet when the range ends on the last note", () => {
    const { warnings, notes } = reachWarnings(
      "2|3-2|4.5: velocity = ramp(1, 127)",
    );

    expect(notes.at(-1)?.velocity).toBe(127);
    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet when the range ends one grid step past the last note", () => {
    // Eight hats fill beats 3-4, so `3|1` is one 16th past the last of them —
    // the ordinary cost of a round bound, not the mistake this warns about.
    const { warnings } = reachWarnings(
      "2|3-3|1: velocity = ramp(1, 127)",
      hats(8),
    );

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet for a whole-bar range over 16ths", () => {
    // `2|*` ends one 16th past the last note of a full bar of 16ths.
    const { warnings } = reachWarnings(
      "2|*: velocity = ramp(1, 127)",
      Array.from({ length: 16 }, (_, i) => ({
        pitch: 68,
        start_time: 4 + i * 0.25,
        duration: 0.25,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      })),
    );

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

  it("finds a ramp nested in another function's arguments", () => {
    const { warnings } = reachWarnings(
      "2|3-3|1: velocity = min(ramp(1, 127), 127)",
    );

    expect(warnings).toHaveLength(1);
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

  it("stays quiet when the range has no span", () => {
    // A range pinned to one instant (`2|3-2|3`) can match a chord, so two
    // positions get through — but there is no span for a ramp to fall short of.
    const { warnings } = reachWarnings("2|3-2|3: velocity = ramp(1, 127)", [
      {
        pitch: 60,
        start_time: 6,
        duration: 0.25,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      },
      {
        pitch: 64,
        start_time: 6,
        duration: 0.25,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      },
    ]);

    expect(warnings).toStrictEqual([]);
  });

  it("stays quiet when the ramp line itself failed", () => {
    // transformedIndices is cumulative: the first line filling it must not make
    // the failed second line look like it applied something.
    const { warnings } = reachWarnings(
      "velocity = 100\n2|3-3|1: velocity = ramp(1, audio.gain)",
    );

    expect(warnings).toStrictEqual([]);
  });
});

describe("a note before the ramp's range start", () => {
  it("keeps a note that sits a hair under a time selector's start", () => {
    // 1|1.1 parses to slightly more than the note's 0.1
    const notes = hats(2).map((note, i) => ({
      ...note,
      start_time: [0.1, 0.5][i] as number,
    }));

    applyTransforms(notes, "1|1.1-1|1.9: velocity = curve(40, 120, 0.5)", 4, 4);

    expect(notes).toHaveLength(2);
    expect(notes[0]!.velocity).toBe(40);
  });

  it("keeps a note an earlier line moved before the first note", () => {
    const notes = hats(3);

    applyTransforms(
      notes,
      "timing -= 0.01\nvelocity = curve(20, 127, 0.5)",
      4,
      4,
    );

    expect(notes).toHaveLength(3);
    expect(notes[0]!.velocity).toBe(20);
  });

  it("never writes a NaN start or pitch", () => {
    const notes = hats(3);

    applyTransforms(
      notes,
      "timing -= 0.01\ntiming += curve(0, 0.1, 0.5)\npitch += curve(0, 12, 0.5)",
      4,
      4,
    );

    for (const note of notes) {
      expect(Number.isNaN(note.start_time)).toBe(false);
      expect(Number.isNaN(note.pitch)).toBe(false);
    }
  });
});
