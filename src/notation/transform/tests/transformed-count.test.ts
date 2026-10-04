// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  addCounts,
  combineOutcomes,
  countTransforms,
  type TransformCounts,
} from "#src/notation/transform/transformed-count.ts";
import {
  createTestNote,
  createTestNotes,
} from "./evaluator/transform-evaluator-test-helpers.ts";

// C3, E3, G3 on beats 1-3
const cMajorTriad = () =>
  createTestNotes([
    { pitch: 60, start_time: 0 },
    { pitch: 64, start_time: 1 },
    { pitch: 67, start_time: 2 },
  ]);

/**
 * Run transforms over the C major triad and count what they did.
 * @param transforms - Transform string to apply
 * @returns The counts of what the transforms changed and deleted
 */
function countsAfter(transforms: string): TransformCounts {
  const notes = cMajorTriad();

  return countTransforms(applyTransforms(notes, transforms, 4, 4), notes);
}

describe("countTransforms", () => {
  it("counts notes deleted from one slot once", () => {
    // Two notes on one slot, as a bar copy makes them, both deleted
    const notes = createTestNotes([
      { pitch: 60, start_time: 0 },
      { pitch: 60, start_time: 0 },
      { pitch: 62, start_time: 1 },
    ]);
    const outcome = applyTransforms(notes, "velocity = 0", 4, 4);

    expect(countTransforms(outcome, [])).toStrictEqual({
      transformed: 0,
      deletedNotes: 2,
    });
  });

  it("is empty when no transform ran", () => {
    expect(countTransforms(undefined, cMajorTriad())).toStrictEqual({});
  });
});

describe("combineOutcomes", () => {
  it("counts a note changed by both outcomes once", () => {
    const notes = cMajorTriad();
    const first = applyTransforms(notes, "C3-E3: velocity += 10", 4, 4);
    const second = applyTransforms(notes, "E3-G3: velocity += 10", 4, 4);

    expect(
      countTransforms(combineOutcomes(first, second), notes),
    ).toStrictEqual({ transformed: 3 });
  });

  it("keeps the notes either outcome deleted", () => {
    const notes = cMajorTriad();
    const first = applyTransforms(notes, "C3: velocity = 0", 4, 4);
    const second = applyTransforms(notes, "G3: velocity = 0", 4, 4);

    expect(
      countTransforms(combineOutcomes(first, second), notes),
    ).toStrictEqual({ transformed: 0, deletedNotes: 2 });
  });

  it("is undefined when no transform ran", () => {
    expect(combineOutcomes(undefined, undefined)).toBeUndefined();
  });

  it("doesn't count a note one pass changed and a later pass put back", () => {
    const notes = cMajorTriad();
    const first = applyTransforms(notes, "C3-E3: velocity += 10", 4, 4);
    const second = applyTransforms(notes, "C3: velocity -= 10", 4, 4);

    expect(
      countTransforms(combineOutcomes(first, second), notes),
    ).toStrictEqual({ transformed: 1 });
  });
});

describe("addCounts", () => {
  it("sums each count and leaves out deletedNotes when it stays 0", () => {
    expect(
      addCounts({ transformed: 2 }, { transformed: 1, deletedNotes: 3 }),
    ).toStrictEqual({ transformed: 3, deletedNotes: 3 });
    expect(addCounts({ transformed: 0 }, {})).toStrictEqual({ transformed: 0 });
    expect(addCounts({}, {})).toStrictEqual({});
  });
});

describe("applyTransforms", () => {
  describe("return value", () => {
    it("returns undefined for null transform string", () => {
      const notes = createTestNote();

      expect(
        applyTransforms(notes, null as unknown as string, 4, 4),
      ).toBeUndefined();
    });

    it("returns undefined for empty transform string", () => {
      const notes = createTestNote();

      expect(applyTransforms(notes, "", 4, 4)).toBeUndefined();
    });

    it("returns undefined for empty notes array", () => {
      const notes: NoteEvent[] = [];

      expect(applyTransforms(notes, "velocity += 10", 4, 4)).toBeUndefined();
    });

    it("counts every note when no selector is used", () => {
      expect(countsAfter("velocity += 10")).toStrictEqual({ transformed: 3 });
    });

    it("counts the matched notes with a pitch selector", () => {
      expect(countsAfter("C3-E3: velocity += 10")).toStrictEqual({
        transformed: 2,
      });
    });

    it("counts deleted notes as deleted, not transformed", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, velocity: 100 },
        { pitch: 64, start_time: 1, velocity: 100 },
      ]);

      // All notes match, velocity set to 0 deletes them
      const result = applyTransforms(notes, "velocity = 0", 4, 4);

      expect(countTransforms(result, notes)).toStrictEqual({
        transformed: 0,
        deletedNotes: 2,
      });
      expect(notes).toHaveLength(0);
    });

    it("reports changed and deleted notes apart", () => {
      expect(
        countsAfter("C3: velocity = 0\nE3-G3: velocity += 10"),
      ).toStrictEqual({ transformed: 2, deletedNotes: 1 });
    });

    it("counts a note deleted by a duration of 0 as deleted", () => {
      expect(countsAfter("E3: duration = 0")).toStrictEqual({
        transformed: 0,
        deletedNotes: 1,
      });
    });

    it("reports transformed 0 for notes left exactly as they were", () => {
      expect(countsAfter("velocity += 0")).toStrictEqual({ transformed: 0 });
      expect(countsAfter("velocity = 100")).toStrictEqual({ transformed: 0 });
    });

    it("reports transformed 0 for a note a later line puts back", () => {
      expect(countsAfter("velocity += 10\nvelocity -= 10")).toStrictEqual({
        transformed: 0,
      });
    });

    it("counts only the notes whose value actually moved", () => {
      // The triad's velocities are all 100, so only G3 changes
      expect(
        countsAfter("C3-E3: velocity += 0\nG3: velocity += 1"),
      ).toStrictEqual({ transformed: 1 });
    });

    it("counts a note once across multiple transform lines", () => {
      // Both lines match all notes - should still count 3, not 6
      expect(countsAfter("velocity += 10\nprobability += -0.1")).toStrictEqual({
        transformed: 3,
      });
    });

    describe("note ops", () => {
      it("reports transformed 0 for a skipped op", () => {
        expect(countsAfter("C3: ratchet(rand(0, 0))")).toStrictEqual({
          transformed: 0,
        });
      });

      it("keeps earlier lines' changes when a note op is skipped", () => {
        expect(
          countsAfter(
            "C3: velocity += 10\nE3: velocity += 10\nC3: ratchet(rand(0, 0))",
          ),
        ).toStrictEqual({ transformed: 2 });
      });

      it("keeps earlier lines' changes when a note op works on other notes", () => {
        // C3 changed, E3 replaced by two pieces
        expect(countsAfter("C3: velocity += 10\nE3: ratchet(2)")).toStrictEqual(
          { transformed: 3 },
        );
      });

      it("doesn't count a note a ratchet couldn't divide", () => {
        // The whole-note grid has no line inside a one-beat note
        expect(countsAfter("C3: ratchet(n/1)")).toStrictEqual({
          transformed: 0,
        });
      });

      it("doesn't count a note a split had no cut for", () => {
        expect(countsAfter("split(3|1)")).toStrictEqual({ transformed: 0 });
      });

      it("doesn't count a lone note merge() leaves alone", () => {
        expect(countsAfter("merge()")).toStrictEqual({ transformed: 0 });
      });

      it("counts only the copies a repeat made, not the notes it kept", () => {
        expect(countsAfter("C3-E3: repeat(n/8)")).toStrictEqual({
          transformed: 2,
        });
      });

      it("counts the merged note as changed and the notes it absorbed as deleted", () => {
        const notes = createTestNotes([
          { pitch: 60, start_time: 0 },
          { pitch: 60, start_time: 1 },
          { pitch: 60, start_time: 2 },
        ]);
        const result = applyTransforms(notes, "merge()", 4, 4);

        expect(countTransforms(result, notes)).toStrictEqual({
          transformed: 1,
          deletedNotes: 2,
        });
      });

      it("counts a short note a merge swallowed as deleted, not the longer one as changed", () => {
        const notes = createTestNotes([
          { pitch: 60, start_time: 0, duration: 4 },
          { pitch: 60, start_time: 1, duration: 1 },
        ]);
        const result = applyTransforms(notes, "merge()", 4, 4);

        expect(countTransforms(result, notes)).toStrictEqual({
          transformed: 0,
          deletedNotes: 1,
        });
      });

      it("counts only the notes the clip held as deleted", () => {
        // The four ratchet pieces never existed; the one note they replaced did
        expect(countsAfter("C3: ratchet(4)\nC3: velocity = 0")).toStrictEqual({
          transformed: 0,
          deletedNotes: 1,
        });
      });

      it("counts the pieces of a ratchet as changed, not the note they replaced as deleted", () => {
        expect(countsAfter("C3: ratchet(4)")).toStrictEqual({ transformed: 4 });
      });
    });

    describe("values Live stores as 32-bit floats", () => {
      const f32 = (value: number) => Math.fround(value);
      const stored = () =>
        createTestNotes([
          {
            pitch: 60,
            start_time: f32(0.1),
            duration: f32(0.3),
            velocity: f32(100.1),
            probability: f32(0.8),
            velocity_deviation: f32(-3.3),
          },
        ]);

      it.each([
        "probability = 0.8",
        "duration = 0.3",
        "velocity = 100.1",
        "deviation = -3.3",
        "timing = 0.1",
      ])("doesn't count %s writing the value already stored", (transform) => {
        const notes = stored();

        expect(
          countTransforms(applyTransforms(notes, transform, 4, 4), notes),
        ).toStrictEqual({ transformed: 0 });
      });

      it("still counts a real change next to the noise", () => {
        const notes = stored();

        expect(
          countTransforms(
            applyTransforms(notes, "probability = 0.8\nvelocity += 1", 4, 4),
            notes,
          ),
        ).toStrictEqual({ transformed: 1 });
      });
    });
  });
});
