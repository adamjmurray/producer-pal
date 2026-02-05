// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { NoteEvent } from "#src/notation/types.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  createTestNote,
  createTestNotes,
} from "./transform-evaluator-test-helpers.ts";

describe("applyTransforms", () => {
  describe("basic functionality", () => {
    it("does nothing with null transform string", () => {
      const notes = createTestNote();

      applyTransforms(notes, null as unknown as string, 4, 4);
      expect(notes[0]!.velocity).toBe(100);
    });

    it("does nothing with empty transform string", () => {
      const notes = createTestNote();

      applyTransforms(notes, "", 4, 4);
      expect(notes[0]!.velocity).toBe(100);
    });

    it("does nothing with empty notes array", () => {
      const notes: NoteEvent[] = [];

      applyTransforms(notes, "velocity += 10", 4, 4);
      expect(notes).toStrictEqual([]);
    });

    it("applies simple velocity transform with += operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "velocity += 10", 4, 4);
      expect(notes[0]!.velocity).toBe(110);
    });

    it("applies simple velocity transform with = operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "velocity = 64", 4, 4);
      expect(notes[0]!.velocity).toBe(64);
    });

    it("modifies notes in-place", () => {
      const notes = createTestNote();
      const originalNotes = notes;

      applyTransforms(notes, "velocity += 10", 4, 4);
      expect(notes).toBe(originalNotes);
    });
  });

  describe("range clamping", () => {
    it("clamps velocity to minimum 1 with += operator", () => {
      const notes = createTestNote({ velocity: 10 });

      applyTransforms(notes, "velocity += -100", 4, 4);
      expect(notes[0]!.velocity).toBe(1);
    });

    it("clamps velocity to maximum 127 with += operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "velocity += 100", 4, 4);
      expect(notes[0]!.velocity).toBe(127);
    });

    it("clamps velocity to minimum 1 with = operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "velocity = 0", 4, 4);
      expect(notes[0]!.velocity).toBe(1);
    });

    it("clamps velocity to maximum 127 with = operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "velocity = 200", 4, 4);
      expect(notes[0]!.velocity).toBe(127);
    });

    it("clamps duration to minimum 0.001 with += operator", () => {
      const notes = createTestNote({ duration: 0.1 });

      applyTransforms(notes, "duration += -1", 4, 4);
      expect(notes[0]!.duration).toBe(0.001);
    });

    it("clamps duration to minimum 0.001 with = operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "duration = -1", 4, 4);
      expect(notes[0]!.duration).toBe(0.001);
    });

    it("clamps probability to minimum 0.0 with += operator", () => {
      const notes = createTestNote({ probability: 0.5 });

      applyTransforms(notes, "probability += -1", 4, 4);
      expect(notes[0]!.probability).toBe(0.0);
    });

    it("clamps probability to maximum 1.0 with += operator", () => {
      const notes = createTestNote({ probability: 0.5 });

      applyTransforms(notes, "probability += 1", 4, 4);
      expect(notes[0]!.probability).toBe(1.0);
    });

    it("clamps probability to minimum 0.0 with = operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "probability = -0.5", 4, 4);
      expect(notes[0]!.probability).toBe(0.0);
    });

    it("clamps probability to maximum 1.0 with = operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "probability = 2.0", 4, 4);
      expect(notes[0]!.probability).toBe(1.0);
    });

    it("modifies timing without clamping with += operator", () => {
      const notes = createTestNote({ start_time: 2 });

      applyTransforms(notes, "timing += 0.5", 4, 4);
      expect(notes[0]!.start_time).toBe(2.5);
    });

    it("sets timing without clamping with = operator", () => {
      const notes = createTestNote({ start_time: 2 });

      applyTransforms(notes, "timing = 5", 4, 4);
      expect(notes[0]!.start_time).toBe(5);
    });
  });

  describe("multi-parameter transform", () => {
    it("applies multiple transforms to same note", () => {
      const notes = createTestNote();
      const modString = `velocity += 10
timing += 0.05
duration += 0.5
probability += -0.2`;

      applyTransforms(notes, modString, 4, 4);
      expect(notes[0]!.velocity).toBe(110);
      expect(notes[0]!.start_time).toBe(0.05);
      expect(notes[0]!.duration).toBe(1.5);
      expect(notes[0]!.probability).toBe(0.8);
    });

    it("applies transforms to multiple notes", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, velocity: 100 },
        { pitch: 64, start_time: 1, velocity: 80 },
        { pitch: 67, start_time: 2, velocity: 90 },
      ]);

      applyTransforms(notes, "velocity += 10", 4, 4);
      expect(notes[0]!.velocity).toBe(110);
      expect(notes[1]!.velocity).toBe(90);
      expect(notes[2]!.velocity).toBe(100);
    });
  });

  describe("time signature handling", () => {
    it("handles 4/4 time signature", () => {
      const notes = createTestNote();

      // In 4/4, 1 Ableton beat = 1 musical beat, so cos(1t) at position 0 = 1
      applyTransforms(notes, "velocity += 20 * cos(1t)", 4, 4);
      expect(notes[0]!.velocity).toBeCloseTo(120, 5);
    });

    it("handles 3/4 time signature", () => {
      const notes = createTestNote();

      // In 3/4, 1 Ableton beat = 1 musical beat
      applyTransforms(notes, "velocity += 20 * cos(1t)", 3, 4);
      expect(notes[0]!.velocity).toBeCloseTo(120, 5);
    });

    it("handles 6/8 time signature", () => {
      const notes = createTestNote();

      // In 6/8, 1 Ableton beat = 2 musical beats (denominator/4 = 8/4 = 2)
      applyTransforms(notes, "velocity += 20 * cos(1t)", 6, 8);
      expect(notes[0]!.velocity).toBeCloseTo(120, 5);
    });

    it("correctly calculates musical beats for different positions in 4/4", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 60, start_time: 0.5 },
        { pitch: 60, start_time: 1 },
      ]);

      // cos(1t) completes one cycle per beat: 0→1, 0.5→-1, 1→1
      applyTransforms(notes, "velocity += 20 * cos(1t)", 4, 4);
      expect(notes[0]!.velocity).toBeCloseTo(120, 5); // cos(0) = 1
      expect(notes[1]!.velocity).toBeCloseTo(80, 5); // cos(0.5) ≈ -1
      expect(notes[2]!.velocity).toBeCloseTo(120, 5); // cos(1) = 1
    });
  });

  describe("pitch filtering", () => {
    it("applies transform only to matching pitch", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 64, start_time: 1 },
      ]);

      applyTransforms(notes, "C3: velocity += 20", 4, 4);
      expect(notes[0]!.velocity).toBe(120);
      expect(notes[1]!.velocity).toBe(100); // unchanged
    });

    it("applies transform to all pitches when no filter specified", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 64, start_time: 1 },
      ]);

      applyTransforms(notes, "velocity += 20", 4, 4);
      expect(notes[0]!.velocity).toBe(120);
      expect(notes[1]!.velocity).toBe(120);
    });
  });

  describe("time range filtering", () => {
    it("applies transform only within time range", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 }, // bar 1, beat 1
        { pitch: 60, start_time: 4 }, // bar 2, beat 1
        { pitch: 60, start_time: 8 }, // bar 3, beat 1
      ]);

      applyTransforms(notes, "1|1-2|4: velocity += 20", 4, 4);
      expect(notes[0]!.velocity).toBe(120); // in range
      expect(notes[1]!.velocity).toBe(120); // in range
      expect(notes[2]!.velocity).toBe(100); // out of range
    });
  });

  describe("edge cases", () => {
    it("handles notes with velocity at lower boundary", () => {
      const notes = createTestNote({ velocity: 1 });

      applyTransforms(notes, "velocity += -10", 4, 4);
      expect(notes[0]!.velocity).toBe(1);
    });

    it("handles notes with velocity at upper boundary", () => {
      const notes = createTestNote({ velocity: 127 });

      applyTransforms(notes, "velocity += 10", 4, 4);
      expect(notes[0]!.velocity).toBe(127);
    });

    it("handles notes with very small duration", () => {
      const notes = createTestNote({ duration: 0.001 });

      applyTransforms(notes, "duration += -0.01", 4, 4);
      expect(notes[0]!.duration).toBe(0.001);
    });

    it("handles notes with probability at boundaries", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, probability: 0 },
        { pitch: 64, start_time: 1, probability: 1 },
      ]);

      applyTransforms(notes, "probability += 0.5", 4, 4);
      expect(notes[0]!.probability).toBe(0.5);
      expect(notes[1]!.probability).toBe(1.0); // clamped
    });
  });

  describe("note property variables", () => {
    it("applies transform using note.pitch variable", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, velocity_deviation: 0 },
        { pitch: 72, start_time: 1, velocity_deviation: 0 },
      ]);

      applyTransforms(notes, "velocity = note.pitch", 4, 4);
      expect(notes[0]!.velocity).toBe(60);
      expect(notes[1]!.velocity).toBe(72);
    });

    it("applies transform using note.velocity variable (self-reference)", () => {
      const notes = createTestNote({ velocity_deviation: 0 });

      applyTransforms(notes, "velocity = note.velocity / 2", 4, 4);
      expect(notes[0]!.velocity).toBe(50);
    });

    it("applies transform using note.deviation variable", () => {
      const notes = createTestNote({ velocity_deviation: 20 });

      applyTransforms(notes, "velocity += note.deviation", 4, 4);
      expect(notes[0]!.velocity).toBe(120);
    });

    it("applies transform using note.duration variable", () => {
      const notes = createTestNote({ duration: 0.5, velocity_deviation: 0 });

      applyTransforms(notes, "probability = note.duration", 4, 4);
      expect(notes[0]!.probability).toBe(0.5);
    });

    it("applies transform using note.probability variable", () => {
      const notes = createTestNote({ probability: 0.5, velocity_deviation: 0 });

      applyTransforms(notes, "velocity = note.probability * 127", 4, 4);
      expect(notes[0]!.velocity).toBeCloseTo(63.5, 1);
    });

    it("applies transform using note.start variable", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, velocity_deviation: 0 },
        { pitch: 60, start_time: 1, velocity_deviation: 0 },
      ]);

      // In 4/4, start_time 0 = 0 beats, start_time 1 = 1 beat
      applyTransforms(notes, "velocity = 64 + note.start * 10", 4, 4);
      expect(notes[0]!.velocity).toBe(64); // 64 + 0 * 10
      expect(notes[1]!.velocity).toBe(74); // 64 + 1 * 10
    });

    it("applies different transforms to different notes based on their properties", () => {
      const notes = createTestNotes([
        {
          pitch: 60,
          start_time: 0,
          duration: 0.25,
          velocity: 80,
          velocity_deviation: 0,
        },
        {
          pitch: 72,
          start_time: 1,
          duration: 0.5,
          velocity: 100,
          velocity_deviation: 0,
        },
      ]);

      applyTransforms(
        notes,
        "velocity = note.pitch + note.duration * 20",
        4,
        4,
      );
      expect(notes[0]!.velocity).toBe(65); // 60 + 0.25 * 20
      expect(notes[1]!.velocity).toBe(82); // 72 + 0.5 * 20
    });

    it("combines note variables with waveforms", () => {
      const notes = createTestNote({ velocity_deviation: 0 });

      applyTransforms(notes, "velocity = note.velocity * cos(1t)", 4, 4);
      expect(notes[0]!.velocity).toBeCloseTo(100, 5); // 100 * cos(0) = 100 * 1
    });
  });

  describe("undefined property handling", () => {
    it("handles probability transform when probability is undefined", () => {
      const notes: NoteEvent[] = createTestNote();

      // Remove probability to match original test
      delete (notes[0] as Partial<NoteEvent>).probability;

      applyTransforms(notes, "probability += -0.3", 4, 4);
      // When probability is undefined, it defaults to 1.0, so 1.0 + -0.3 = 0.7
      expect(notes[0]!.probability).toBe(0.7);
    });
  });
});
