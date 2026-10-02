// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  combineOutcomes,
  countTransformed,
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

describe("countTransformed", () => {
  it("counts notes deleted from one slot once", () => {
    // Two notes on one slot, as a bar copy makes them, both deleted
    const notes = createTestNotes([
      { pitch: 60, start_time: 0 },
      { pitch: 60, start_time: 0 },
      { pitch: 62, start_time: 1 },
    ]);
    const outcome = applyTransforms(notes, "velocity = 0", 4, 4);

    expect(countTransformed(outcome, [])).toBe(2);
  });
});

describe("combineOutcomes", () => {
  it("counts a note touched by both outcomes once", () => {
    const notes = cMajorTriad();
    const first = applyTransforms(notes, "C3-E3: velocity += 0", 4, 4);
    const second = applyTransforms(notes, "E3-G3: velocity += 0", 4, 4);

    expect(countTransformed(combineOutcomes(first, second), notes)).toBe(3);
  });

  it("keeps the notes either outcome deleted", () => {
    const notes = cMajorTriad();
    const first = applyTransforms(notes, "C3: velocity = 0", 4, 4);
    const second = applyTransforms(notes, "G3: velocity = 0", 4, 4);

    expect(countTransformed(combineOutcomes(first, second), notes)).toBe(2);
  });

  it("is undefined when no transform ran", () => {
    expect(combineOutcomes(undefined, undefined)).toBeUndefined();
  });
});

describe("applyTransforms", () => {
  describe("return value (transformed count)", () => {
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

    it("returns count of all notes when no selector is used", () => {
      const notes = cMajorTriad();

      expect(
        countTransformed(applyTransforms(notes, "velocity += 10", 4, 4), notes),
      ).toBe(3);
    });

    it("returns count of matched notes with pitch selector", () => {
      const notes = cMajorTriad();

      expect(
        countTransformed(
          applyTransforms(notes, "C3-E3: velocity += 10", 4, 4),
          notes,
        ),
      ).toBe(2);
    });

    it("counts deleted notes as transformed", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, velocity: 100 },
        { pitch: 64, start_time: 1, velocity: 100 },
      ]);

      // All notes match, velocity set to 0 deletes them
      const result = applyTransforms(notes, "velocity = 0", 4, 4);

      expect(countTransformed(result, notes)).toBe(2);
      expect(notes).toHaveLength(0);
    });

    it("deduplicates across multiple transform lines", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 64, start_time: 1 },
        { pitch: 67, start_time: 2 },
      ]);

      // Both lines match all notes - should still count 3, not 6
      const result = applyTransforms(
        notes,
        "velocity += 10\nprobability += -0.1",
        4,
        4,
      );

      expect(countTransformed(result, notes)).toBe(3);
    });

    describe("note ops", () => {
      // C3, E3, G3 on beats 1-3
      const countAfter = (transforms: string): number | undefined => {
        const notes = cMajorTriad();

        return countTransformed(
          applyTransforms(notes, transforms, 4, 4),
          notes,
        );
      };

      it("keeps earlier lines' notes when a note op is skipped", () => {
        expect(
          countAfter(
            "C3: velocity += 0\nE3: velocity += 0\nC3: ratchet(rand(0, 0))",
          ),
        ).toBe(2);
      });

      it("keeps earlier lines' notes when a note op works on other notes", () => {
        // C3 touched, E3 replaced by two pieces
        expect(countAfter("C3: velocity += 0\nE3: ratchet(2)")).toBe(3);
      });

      it("counts the notes a repeat kept and the copies it made", () => {
        expect(countAfter("C3-E3: repeat(n/8)")).toBe(4);
      });

      it("counts nothing for a skipped op", () => {
        expect(countAfter("C3: ratchet(rand(0, 0))")).toBe(0);
      });

      it("doesn't count notes a merge consumed", () => {
        const notes = createTestNotes([
          { pitch: 60, start_time: 0 },
          { pitch: 60, start_time: 1 },
        ]);
        const result = applyTransforms(notes, "velocity += 0\nmerge()", 4, 4);

        expect(countTransformed(result, notes)).toBe(1);
      });
    });
  });
});
