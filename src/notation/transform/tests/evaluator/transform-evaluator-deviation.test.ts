import { describe, expect, it } from "vitest";
import type { NoteEvent } from "#src/notation/types.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  createTestNote,
  createTestNotes,
} from "./transform-evaluator-test-helpers.ts";

describe("applyTransforms deviation parameter", () => {
  it("applies deviation transform with = operator", () => {
    const notes = createTestNote({ velocity_deviation: 10 });

    applyTransforms(notes, "deviation = 25", 4, 4);
    expect(notes[0]!.velocity_deviation).toBe(25);
  });

  it("applies deviation transform with += operator", () => {
    const notes = createTestNote({ velocity_deviation: 10 });

    applyTransforms(notes, "deviation += 15", 4, 4);
    expect(notes[0]!.velocity_deviation).toBe(25);
  });

  it("clamps deviation to minimum -127", () => {
    const notes = createTestNote({ velocity_deviation: -100 });

    applyTransforms(notes, "deviation += -50", 4, 4);
    expect(notes[0]!.velocity_deviation).toBe(-127);
  });

  it("allows negative deviation values", () => {
    const notes = createTestNote({ velocity_deviation: 10 });

    applyTransforms(notes, "deviation = -50", 4, 4);
    expect(notes[0]!.velocity_deviation).toBe(-50);
  });

  it("clamps deviation to maximum 127", () => {
    const notes = createTestNote({ velocity_deviation: 100 });

    applyTransforms(notes, "deviation += 50", 4, 4);
    expect(notes[0]!.velocity_deviation).toBe(127);
  });

  it("handles undefined velocity_deviation with += operator", () => {
    const notes: NoteEvent[] = createTestNote();

    // Remove probability to match original test - intentionally omit velocity_deviation
    delete (notes[0] as Partial<NoteEvent>).probability;

    applyTransforms(notes, "deviation += 20", 4, 4);
    expect(notes[0]!.velocity_deviation).toBe(20);
  });

  it("applies deviation with pitch filter", () => {
    const notes = createTestNotes([
      { pitch: 60, start_time: 0, velocity_deviation: 10 },
      { pitch: 64, start_time: 1, velocity_deviation: 10 },
    ]);

    applyTransforms(notes, "C3: deviation = 30", 4, 4);
    expect(notes[0]!.velocity_deviation).toBe(30);
    expect(notes[1]!.velocity_deviation).toBe(10); // unchanged
  });

  it("uses note.deviation variable in expressions", () => {
    const notes = createTestNote({ velocity_deviation: 20 });

    applyTransforms(notes, "velocity += note.deviation", 4, 4);
    expect(notes[0]!.velocity).toBe(120);
  });
});
