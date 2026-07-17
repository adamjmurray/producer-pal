// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "../types.ts";
import { applyV0Deletions } from "./barbeat-apply-v0-deletions.ts";

// A regular (audible) note of the standard 1-beat duration.
function note(pitch: number, start_time: number): NoteEvent {
  return { pitch, start_time, duration: 1, velocity: 100 };
}

// A v0 (velocity 0) deletion marker at the given pitch/time.
function v0(pitch: number, start_time: number): NoteEvent {
  return { pitch, start_time, duration: 1, velocity: 0 };
}

describe("applyV0Deletions()", () => {
  it("returns empty array for empty input", () => {
    expect(applyV0Deletions([])).toStrictEqual([]);
  });

  it("returns notes unchanged when there are no v0 notes", () => {
    const notes = [note(60, 0), note(62, 0), note(64, 1)];

    expect(applyV0Deletions(notes)).toStrictEqual(notes);
  });

  it("deletes earlier note with same pitch and time when v0 note is encountered", () => {
    const notes = [note(60, 0), note(62, 0), v0(60, 0)];

    const result = applyV0Deletions(notes);

    // The v0 deletes the matching C3 and is itself filtered out.
    expect(result).toStrictEqual([note(62, 0)]);
  });

  it("v0 note does not affect notes with different pitch", () => {
    const notes = [note(60, 0), note(62, 0), v0(64, 0)];

    const result = applyV0Deletions(notes);

    // Nothing matches the v0's pitch, so both notes survive.
    expect(result).toStrictEqual([note(60, 0), note(62, 0)]);
  });

  it("v0 note does not affect notes with different time (difference >= 0.001)", () => {
    const notes = [note(60, 0), note(60, 0.001), v0(60, 0)];

    const result = applyV0Deletions(notes);

    // Only the exact-time note is deleted; the 0.001-away note survives.
    expect(result).toStrictEqual([note(60, 0.001)]);
  });

  it("v0 note affects notes with very similar time (difference < 0.001)", () => {
    const notes = [note(60, 0), note(60, 0.0005), v0(60, 0.0002)];

    const result = applyV0Deletions(notes);

    // Both notes are within the epsilon of the v0, so all are gone.
    expect(result).toStrictEqual([]);
  });

  it("handles multiple v0 notes", () => {
    const notes = [
      note(60, 0),
      note(62, 0),
      note(64, 1),
      v0(60, 0), // delete first
      v0(62, 0), // delete second
    ];

    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([note(64, 1)]); // only the un-deleted E3 survives
  });

  it("v0 note followed by same note keeps only the new note", () => {
    const notes = [
      note(60, 0),
      v0(60, 0), // delete previous
      note(60, 0), // added after the v0, so it survives
    ];

    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([note(60, 0)]);
  });

  it("v0 notes are filtered out from the result array", () => {
    const notes = [note(60, 0), note(62, 0), v0(60, 0), v0(62, 0)];

    const result = applyV0Deletions(notes);

    // No v0 notes should be in the result
    expect(result.filter((n) => n.velocity === 0)).toHaveLength(0);
    // And no regular notes should remain (all were deleted by v0s)
    expect(result.filter((n) => n.velocity > 0)).toHaveLength(0);
  });

  it("v0 note only deletes notes that appear before it (serial order)", () => {
    const notes = [
      v0(60, 0), // v0 first, nothing to delete
      note(60, 0), // added after v0
    ];

    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([note(60, 0)]); // note remains
  });

  it("handles complex scenario with multiple notes and v0 deletions", () => {
    const notes = [
      note(60, 0),
      note(62, 0),
      note(64, 1),
      note(60, 2),
      v0(60, 0), // delete first C3
      note(64, 1), // another E3 at same time
      v0(64, 1), // delete both E3s
      note(62, 3), // another D3 at different time
    ];

    const result = applyV0Deletions(notes);

    expect(result).toStrictEqual([
      note(62, 0), // survives
      note(60, 2), // survives (different time)
      note(62, 3), // survives
    ]);
  });

  it("v0 note deletes note and is filtered out itself", () => {
    // A fully-populated note (probability/deviation) is still matched on
    // pitch+time alone, and the v0 marker never reaches the result.
    const notes: NoteEvent[] = [
      {
        pitch: 60,
        start_time: 0,
        duration: 2.5,
        velocity: 80,
        probability: 0.8,
        velocity_deviation: 10,
      },
      { ...v0(60, 0), probability: 1.0 },
    ];

    const result = applyV0Deletions(notes);

    expect(result).toHaveLength(0);
  });
});
