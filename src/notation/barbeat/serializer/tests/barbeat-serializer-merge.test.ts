// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { formatNotation } from "../barbeat-serializer.ts";
import { cMajorAt, dMinorAt } from "./barbeat-serializer-test-helpers.ts";

describe("comma merging", () => {
  it("merges identical single notes at different beats in same bar", () => {
    const notes = [
      createNote({ start_time: 0 }),
      createNote({ start_time: 2 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 C3 1|1,3");
  });

  it("merges identical chords at different beats in same bar", () => {
    const notes = [...cMajorAt(0), ...cMajorAt(2)];

    expect(formatNotation(notes)).toBe("v100 n/4 C3 E3 G3 1|1,3");
  });

  it("does not merge notes in different bars", () => {
    const notes = [
      createNote({ start_time: 0 }),
      createNote({ start_time: 4 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 C3 1|1\nC3 2|1");
  });

  it("does not merge notes with different pitches", () => {
    const notes = [
      createNote({ start_time: 0 }),
      createNote({ pitch: 64, start_time: 1 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 C3 1|1\nE3 1|2");
  });

  it("does not merge notes with different velocities", () => {
    const notes = [
      createNote({ velocity: 80, start_time: 0 }),
      createNote({ velocity: 100, start_time: 1 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v80 n/4 C3 1|1\nv100 C3 1|2");
  });

  it("does not merge notes with different durations", () => {
    const notes = [
      createNote({ duration: 0.5, start_time: 0 }),
      createNote({ duration: 1, start_time: 1 }),
    ] as NoteEvent[];

    // 0.5 quarter = /8 whole; 1 quarter = /4 whole
    expect(formatNotation(notes)).toBe("v100 n/8 C3 1|1\nn/4 C3 1|2");
  });

  it("does not merge notes with different probabilities", () => {
    const notes = [
      createNote({ probability: 0.8, start_time: 0 }),
      createNote({ probability: 1.0, start_time: 1 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 p0.8 C3 1|1\np1 C3 1|2");
  });

  it("does not merge notes with different velocity deviations", () => {
    const notes = [
      createNote({ velocity: 80, velocity_deviation: 20, start_time: 0 }),
      createNote({ velocity: 80, velocity_deviation: 0, start_time: 1 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v80-100 n/4 C3 1|1\nv80 C3 1|2");
  });

  it("merges notes when both have undefined probability and velocity_deviation", () => {
    // Tests ?? fallback in notesMatch for both probability and velocity_deviation
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 1, duration: 1, velocity: 100 },
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 C3 1|1,2");
  });

  it("does not merge when one note has probability and other has undefined", () => {
    const notes = [
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 0.5,
      },
      { pitch: 60, start_time: 1, duration: 1, velocity: 100 },
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 p0.5 C3 1|1\np1 C3 1|2");
  });

  it("merges more than 2 groups", () => {
    const notes = [
      createNote({ start_time: 0 }),
      createNote({ start_time: 1 }),
      createNote({ start_time: 2 }),
      createNote({ start_time: 3 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 C3 1|1,2,3,4");
  });

  it("handles mixed mergeable and non-mergeable groups", () => {
    const notes = [
      createNote({ start_time: 0 }),
      createNote({ start_time: 2 }),
      // Different pitch breaks the merge
      createNote({ pitch: 64, start_time: 3 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 C3 1|1,3\nE3 1|4");
  });

  it("merges with non-default state", () => {
    const notes = [
      createNote({ velocity: 80, duration: 0.5, start_time: 0 }),
      createNote({ velocity: 80, duration: 0.5, start_time: 1 }),
      createNote({ velocity: 80, duration: 0.5, start_time: 2 }),
    ] as NoteEvent[];

    // 0.5 quarter = /8 whole
    expect(formatNotation(notes)).toBe("v80 n/8 C3 1|1,2,3");
  });

  it("merges repeated chord progression pattern", () => {
    const notes = [
      ...cMajorAt(0),
      ...dMinorAt(1),
      ...cMajorAt(2),
      ...dMinorAt(3),
    ];

    // C/E/G merges at 1,3 and D/F/A merges at 2,4
    expect(formatNotation(notes)).toBe(
      "v100 n/4 C3 E3 G3 1|1,3\nD3 F3 A3 1|2,4",
    );
  });

  it("does not merge chords with different note count", () => {
    const notes = [
      createNote({ start_time: 0 }),
      createNote({ pitch: 64, start_time: 0 }),
      // Only one note at beat 2
      createNote({ start_time: 1 }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe("v100 n/4 C3 E3 1|1\nC3 1|2");
  });
});
