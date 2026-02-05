// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { applyV0Deletions } from "./barbeat-apply-v0-deletions.ts";

describe("applyV0Deletions()", () => {
  it("returns empty array for empty input", () => {
    expect(applyV0Deletions([])).toStrictEqual([]);
  });

  it("returns notes unchanged when there are no v0 notes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 1, duration: 1, velocity: 100 },
    ];

    expect(applyV0Deletions(notes)).toStrictEqual(notes);
  });

  it("deletes earlier note with same pitch and time when v0 note is encountered", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 deletes first note
    ];
    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      // v0 note filtered out
    ]);
  });

  it("v0 note does not affect notes with different pitch", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 0 }, // different pitch
    ];
    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      // v0 note filtered out
    ]);
  });

  it("v0 note does not affect notes with different time (difference >= 0.001)", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0.001, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // only deletes first note
    ];
    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      { pitch: 60, start_time: 0.001, duration: 1, velocity: 100 }, // survives
      // v0 note filtered out
    ]);
  });

  it("v0 note affects notes with very similar time (difference < 0.001)", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0.0005, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0.0002, duration: 1, velocity: 0 }, // deletes both
    ];
    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      // v0 note filtered out, all notes deleted
    ]);
  });

  it("handles multiple v0 notes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 1, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // delete first
      { pitch: 62, start_time: 0, duration: 1, velocity: 0 }, // delete second
    ];
    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      { pitch: 64, start_time: 1, duration: 1, velocity: 100 }, // survives
      // v0 notes filtered out
    ]);
  });

  it("v0 note followed by same note keeps only the new note", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // delete previous
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // new note
    ];
    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // new note
      // v0 note filtered out
    ]);
  });

  it("v0 notes are filtered out from the result array", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0
      { pitch: 62, start_time: 0, duration: 1, velocity: 0 }, // v0
    ];
    const result = applyV0Deletions(notes);

    // No v0 notes should be in the result
    expect(result.filter((n) => n.velocity === 0)).toHaveLength(0);
    // And no regular notes should remain (all were deleted by v0s)
    expect(result.filter((n) => n.velocity > 0)).toHaveLength(0);
  });

  it("v0 note only deletes notes that appear before it (serial order)", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 first, nothing to delete
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // added after v0
    ];
    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // note remains
      // v0 note filtered out
    ]);
  });

  it("handles complex scenario with multiple notes and v0 deletions", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 1, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 2, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // delete first C3
      { pitch: 64, start_time: 1, duration: 1, velocity: 100 }, // another E3 at same time
      { pitch: 64, start_time: 1, duration: 1, velocity: 0 }, // delete both E3s
      { pitch: 62, start_time: 3, duration: 1, velocity: 100 }, // another D3 at different time
    ];
    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 }, // survives
      { pitch: 60, start_time: 2, duration: 1, velocity: 100 }, // survives (different time)
      { pitch: 62, start_time: 3, duration: 1, velocity: 100 }, // survives
      // v0 notes filtered out
    ]);
  });

  it("v0 note deletes note and is filtered out itself", () => {
    const notes = [
      {
        pitch: 60,
        start_time: 0,
        duration: 2.5,
        velocity: 80,
        probability: 0.8,
        velocity_deviation: 10,
      },
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 0,
        probability: 1.0,
      },
    ];
    const result = applyV0Deletions(notes);

    expect(result).toHaveLength(0);
    // v0 note deleted the first note and was filtered out itself
  });
});
