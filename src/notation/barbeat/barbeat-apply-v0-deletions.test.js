import { describe, expect, it } from "vitest";
import { applyV0Deletions } from "./barbeat-apply-v0-deletions";

describe("applyV0Deletions()", () => {
  it("returns empty array for empty input", () => {
    expect(applyV0Deletions([])).toEqual([]);
  });

  it("returns notes unchanged when there are no v0 notes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 1, duration: 1, velocity: 100 },
    ];
    expect(applyV0Deletions(notes)).toEqual(notes);
  });

  it("deletes earlier note with same pitch and time when v0 note is encountered", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 deletes first note
    ];
    const result = applyV0Deletions(notes);
    expect(result).toEqual([
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 note remains
    ]);
  });

  it("v0 note does not affect notes with different pitch", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 0 }, // different pitch
    ];
    const result = applyV0Deletions(notes);
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 0 }, // v0 note remains
    ]);
  });

  it("v0 note does not affect notes with different time (difference >= 0.001)", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0.001, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // only deletes first note
    ];
    const result = applyV0Deletions(notes);
    expect(result).toEqual([
      { pitch: 60, start_time: 0.001, duration: 1, velocity: 100 }, // survives
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 note remains
    ]);
  });

  it("v0 note affects notes with very similar time (difference < 0.001)", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0.0005, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0.0002, duration: 1, velocity: 0 }, // deletes both
    ];
    const result = applyV0Deletions(notes);
    expect(result).toEqual([
      { pitch: 60, start_time: 0.0002, duration: 1, velocity: 0 }, // v0 note remains
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
    expect(result).toEqual([
      { pitch: 64, start_time: 1, duration: 1, velocity: 100 }, // survives
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 note remains
      { pitch: 62, start_time: 0, duration: 1, velocity: 0 }, // v0 note remains
    ]);
  });

  it("v0 note followed by same note keeps both", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // delete previous
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // new note
    ];
    const result = applyV0Deletions(notes);
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 note remains
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // new note
    ]);
  });

  it("v0 notes remain in the result array", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0
      { pitch: 62, start_time: 0, duration: 1, velocity: 0 }, // v0
    ];
    const result = applyV0Deletions(notes);
    // Both v0 notes should be in the result
    expect(result.filter((n) => n.velocity === 0)).toHaveLength(2);
    // And no regular notes should remain
    expect(result.filter((n) => n.velocity > 0)).toHaveLength(0);
  });

  it("v0 note only deletes notes that appear before it (serial order)", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 first, nothing to delete
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // added after v0
    ];
    const result = applyV0Deletions(notes);
    expect(result).toEqual([
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 note remains
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // note remains
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
    expect(result).toEqual([
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 }, // survives
      { pitch: 60, start_time: 2, duration: 1, velocity: 100 }, // survives (different time)
      { pitch: 60, start_time: 0, duration: 1, velocity: 0 }, // v0 note remains
      { pitch: 64, start_time: 1, duration: 1, velocity: 0 }, // v0 note remains
      { pitch: 62, start_time: 3, duration: 1, velocity: 100 }, // survives
    ]);
  });

  it("preserves note properties other than velocity, pitch, and start_time", () => {
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
        velocity_deviation: 0,
      },
    ];
    const result = applyV0Deletions(notes);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      pitch: 60,
      start_time: 0,
      duration: 1,
      velocity: 0,
      probability: 1.0,
      velocity_deviation: 0,
    });
  });
});
