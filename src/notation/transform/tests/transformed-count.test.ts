// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  combineOutcomes,
  countTransformed,
} from "#src/notation/transform/transformed-count.ts";
import { createTestNotes } from "./evaluator/transform-evaluator-test-helpers.ts";

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
