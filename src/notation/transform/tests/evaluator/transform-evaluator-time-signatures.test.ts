// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  createTestNote,
  createTestNotes,
} from "./transform-evaluator-test-helpers.ts";

describe("transform timing/duration in non-4/4 time signatures", () => {
  describe("6/8 time signature (eighth note = 1 musical beat)", () => {
    // Conversion factor: denominator/4 = 8/4 = 2.0 (Ableton beats to musical beats)
    // Inverse: 4/denominator = 4/8 = 0.5 (musical beats to Ableton beats)

    describe("timing parameter", () => {
      it("timing += 1 adds 1 eighth note (0.5 Ableton beats)", () => {
        const notes = createTestNote({ start_time: 2.0 });

        applyTransforms(notes, "timing += 1", 6, 8);
        expect(notes[0]!.start_time).toBeCloseTo(2.5, 10);
      });

      it("timing += 2 adds 2 eighth notes (1 Ableton beat)", () => {
        const notes = createTestNote({ start_time: 1.0 });

        applyTransforms(notes, "timing += 2", 6, 8);
        expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      });

      it("timing = 4 sets to 4 eighth notes (2 Ableton beats)", () => {
        const notes = createTestNote({ start_time: 1.0 });

        applyTransforms(notes, "timing = 4", 6, 8);
        expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      });

      it("timing = 6 sets to 6 eighth notes (3 Ableton beats)", () => {
        const notes = createTestNote({ start_time: 0.5 });

        applyTransforms(notes, "timing = 6", 6, 8);
        expect(notes[0]!.start_time).toBeCloseTo(3.0, 10);
      });

      it("handles negative timing offsets correctly", () => {
        const notes = createTestNote({ start_time: 2.0 });

        applyTransforms(notes, "timing += -2", 6, 8);
        expect(notes[0]!.start_time).toBeCloseTo(1.0, 10);
      });
    });

    describe("duration parameter", () => {
      it("duration = 2 sets to 2 eighth notes (1 Ableton beat)", () => {
        const notes = createTestNote({ duration: 1.5 });

        applyTransforms(notes, "duration = 2", 6, 8);
        expect(notes[0]!.duration).toBeCloseTo(1.0, 10);
      });

      it("duration += 4 adds 4 eighth notes (2 Ableton beats)", () => {
        const notes = createTestNote({ duration: 1.0 });

        applyTransforms(notes, "duration += 4", 6, 8);
        expect(notes[0]!.duration).toBeCloseTo(3.0, 10);
      });

      it("duration = 6 sets to 6 eighth notes (3 Ableton beats = 1 bar)", () => {
        const notes = createTestNote({ duration: 0.5 });

        applyTransforms(notes, "duration = 6", 6, 8);
        expect(notes[0]!.duration).toBeCloseTo(3.0, 10);
      });

      it("deletes note when duration set to zero in 6/8", () => {
        const notes = createTestNote({ duration: 1.0 });

        applyTransforms(notes, "duration = 0", 6, 8);
        expect(notes).toHaveLength(0);
      });
    });

    describe("note.duration variable", () => {
      it("note.duration is in musical beats (2 Ableton beats = 4 eighth notes)", () => {
        const notes = createTestNote({ duration: 2.0, velocity_deviation: 0 });

        applyTransforms(notes, "velocity = note.duration * 10", 6, 8);
        expect(notes[0]!.velocity).toBeCloseTo(40, 5);
      });

      it("note.duration works in expressions (1.5 Ableton beats = 3 eighth notes)", () => {
        const notes = createTestNote({ duration: 1.5, velocity_deviation: 0 });

        applyTransforms(notes, "velocity = note.duration * 20", 6, 8);
        expect(notes[0]!.velocity).toBeCloseTo(60, 5);
      });

      it("can use note.duration to modify duration itself", () => {
        const notes = createTestNote({ duration: 1.0 });

        applyTransforms(notes, "duration = note.duration * 2", 6, 8);
        // 1.0 Ableton beats = 2 eighth notes * 2 = 4 eighth notes = 2.0 Ableton beats
        expect(notes[0]!.duration).toBeCloseTo(2.0, 10);
      });
    });

    describe("note.start variable", () => {
      it("note.start is in musical beats (1 Ableton beat = 2 eighth notes)", () => {
        const notes = createTestNote({
          start_time: 1.0,
          velocity_deviation: 0,
        });

        applyTransforms(notes, "velocity = note.start * 10", 6, 8);
        expect(notes[0]!.velocity).toBeCloseTo(20, 5);
      });

      it("can use note.start to modify timing", () => {
        const notes = createTestNote({ start_time: 1.0 });

        applyTransforms(notes, "timing += note.start", 6, 8);
        // start_time 1.0 Ableton beats = 2 musical beats
        // timing += 2 musical beats = 1.0 Ableton beats
        expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      });
    });

    describe("combined transforms", () => {
      it("applies both timing and duration transforms correctly", () => {
        const notes = createTestNote({ start_time: 1.0, duration: 1.0 });

        applyTransforms(notes, "timing += 2\nduration = 4", 6, 8);
        // timing += 2 eighth notes = 1.0 Ableton beats -> 2.0 total
        // duration = 4 eighth notes = 2.0 Ableton beats
        expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
        expect(notes[0]!.duration).toBeCloseTo(2.0, 10);
      });

      it("handles multi-parameter transforms with expressions", () => {
        const notes = createTestNote({
          start_time: 0.5,
          duration: 1.0,
          velocity_deviation: 0,
        });

        applyTransforms(
          notes,
          "timing += note.start\nduration = note.duration * 3\nvelocity = note.duration * 5",
          6,
          8,
        );
        // Assignments apply sequentially (each sees mutations from the previous):
        // 1. timing += note.start: note.start = 0.5 Ableton * 2 = 1 musical beat -> 1.0 Ableton
        // 2. duration = note.duration * 3: note.duration = 2 musical beats * 3 = 6 = 3.0 Ableton
        // 3. velocity = note.duration * 5: note.duration is now 6 musical beats * 5 = 30
        expect(notes[0]!.start_time).toBeCloseTo(1.0, 10);
        expect(notes[0]!.duration).toBeCloseTo(3.0, 10);
        expect(notes[0]!.velocity).toBeCloseTo(30, 5);
      });
    });

    describe("waveforms with note.duration period", () => {
      it("cos() with note.duration period works correctly", () => {
        const notes = createTestNote({
          start_time: 0,
          duration: 1.5,
          velocity_deviation: 0,
        });

        // duration 1.5 Ableton beats = 3 eighth notes = 3 musical beats
        // cos with period of 3 musical beats at position 0 should be 1
        applyTransforms(
          notes,
          "velocity = note.velocity * cos(note.duration)",
          6,
          8,
        );
        expect(notes[0]!.velocity).toBeCloseTo(100, 5);
      });
    });
  });

  describe("2/2 time signature (half note = 1 musical beat)", () => {
    // Conversion factor: denominator/4 = 2/4 = 0.5 (Ableton beats to musical beats)
    // Inverse: 4/denominator = 4/2 = 2.0 (musical beats to Ableton beats)

    describe("timing parameter", () => {
      it("timing += 1 adds 1 half note (2 Ableton beats)", () => {
        const notes = createTestNote({ start_time: 0.0 });

        applyTransforms(notes, "timing += 1", 2, 2);
        expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      });

      it("timing = 2 sets to 2 half notes (4 Ableton beats)", () => {
        const notes = createTestNote({ start_time: 1.0 });

        applyTransforms(notes, "timing = 2", 2, 2);
        expect(notes[0]!.start_time).toBeCloseTo(4.0, 10);
      });

      it("timing += 0.5 adds 0.5 half notes (1 Ableton beat)", () => {
        const notes = createTestNote({ start_time: 1.0 });

        applyTransforms(notes, "timing += 0.5", 2, 2);
        expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      });
    });

    describe("duration parameter", () => {
      it("duration = 2 sets to 2 half notes (4 Ableton beats)", () => {
        const notes = createTestNote({ duration: 1.0 });

        applyTransforms(notes, "duration = 2", 2, 2);
        expect(notes[0]!.duration).toBeCloseTo(4.0, 10);
      });

      it("duration += 1 adds 1 half note (2 Ableton beats)", () => {
        const notes = createTestNote({ duration: 1.0 });

        applyTransforms(notes, "duration += 1", 2, 2);
        expect(notes[0]!.duration).toBeCloseTo(3.0, 10);
      });
    });

    describe("note.duration variable", () => {
      it("note.duration is in musical beats (4 Ableton beats = 2 half notes)", () => {
        const notes = createTestNote({ duration: 4.0, velocity_deviation: 0 });

        applyTransforms(notes, "velocity = note.duration * 10", 2, 2);
        // 4.0 Ableton beats * 0.5 = 2 musical beats * 10 = 20
        expect(notes[0]!.velocity).toBeCloseTo(20, 5);
      });
    });

    describe("combined transforms", () => {
      it("applies both timing and duration correctly", () => {
        const notes = createTestNote({ start_time: 2.0, duration: 2.0 });

        applyTransforms(notes, "timing += 1\nduration = 1", 2, 2);
        // timing += 1 half note = 2 Ableton beats -> 4.0 total
        // duration = 1 half note = 2 Ableton beats
        expect(notes[0]!.start_time).toBeCloseTo(4.0, 10);
        expect(notes[0]!.duration).toBeCloseTo(2.0, 10);
      });
    });
  });

  describe("3/4 time signature (quarter note = 1 musical beat)", () => {
    // Conversion factor: denominator/4 = 4/4 = 1.0 (same as 4/4)

    it("timing and duration work correctly (factor = 1.0, like 4/4)", () => {
      const notes = createTestNote({ start_time: 1.0, duration: 1.0 });

      applyTransforms(notes, "timing += 1\nduration += 1", 3, 4);
      expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      expect(notes[0]!.duration).toBeCloseTo(2.0, 10);
    });

    it("note.duration variable works correctly", () => {
      const notes = createTestNote({ duration: 2.0, velocity_deviation: 0 });

      applyTransforms(notes, "velocity = note.duration * 10", 3, 4);
      expect(notes[0]!.velocity).toBeCloseTo(20, 5);
    });

    it("handles set operator correctly", () => {
      const notes = createTestNote({ start_time: 5.0, duration: 3.0 });

      applyTransforms(notes, "timing = 2\nduration = 1.5", 3, 4);
      expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      expect(notes[0]!.duration).toBeCloseTo(1.5, 10);
    });
  });

  describe("5/4 time signature (quarter note = 1 musical beat)", () => {
    // Conversion factor: denominator/4 = 4/4 = 1.0

    it("timing and duration conversions work correctly", () => {
      const notes = createTestNote({ start_time: 2.0, duration: 1.0 });

      applyTransforms(notes, "timing += 2\nduration = 3", 5, 4);
      expect(notes[0]!.start_time).toBeCloseTo(4.0, 10);
      expect(notes[0]!.duration).toBeCloseTo(3.0, 10);
    });

    it("note properties work correctly", () => {
      const notes = createTestNote({
        start_time: 1.5,
        duration: 2.5,
        velocity_deviation: 0,
      });

      applyTransforms(
        notes,
        "timing = note.start * 2\nvelocity = note.duration * 10",
        5,
        4,
      );
      expect(notes[0]!.start_time).toBeCloseTo(3.0, 10);
      expect(notes[0]!.velocity).toBeCloseTo(25, 5);
    });
  });

  describe("edge cases", () => {
    it("deletes note when duration set to negative in 6/8", () => {
      const notes = createTestNote({ duration: 1.0 });

      applyTransforms(notes, "duration = -10", 6, 8);
      expect(notes).toHaveLength(0);
    });

    it("deletes note when duration drops below zero in 2/2", () => {
      const notes = createTestNote({ duration: 1.0 });

      applyTransforms(notes, "duration += -100", 2, 2);
      expect(notes).toHaveLength(0);
    });

    it("handles very small timing increments in 6/8", () => {
      const notes = createTestNote({ start_time: 1.0 });

      applyTransforms(notes, "timing += 0.1", 6, 8);
      // 0.1 eighth notes = 0.05 Ableton beats
      expect(notes[0]!.start_time).toBeCloseTo(1.05, 10);
    });

    it("handles fractional beats in 2/2", () => {
      const notes = createTestNote({ start_time: 1.0, duration: 1.0 });

      applyTransforms(notes, "timing += 0.25\nduration = 0.75", 2, 2);
      // 0.25 half notes = 0.5 Ableton beats
      // 0.75 half notes = 1.5 Ableton beats
      expect(notes[0]!.start_time).toBeCloseTo(1.5, 10);
      expect(notes[0]!.duration).toBeCloseTo(1.5, 10);
    });

    it("multiple notes transformed correctly in 6/8", () => {
      const notes = createTestNotes([
        { start_time: 0, duration: 1.0 },
        { start_time: 1.0, duration: 1.0 },
        { start_time: 2.0, duration: 1.0 },
      ]);

      applyTransforms(notes, "timing += 2\nduration = 4", 6, 8);
      // Each note shifted by 2 eighth notes = 1.0 Ableton beats
      // Duration set to 4 eighth notes = 2.0 Ableton beats
      expect(notes[0]!.start_time).toBeCloseTo(1.0, 10);
      expect(notes[0]!.duration).toBeCloseTo(2.0, 10);
      expect(notes[1]!.start_time).toBeCloseTo(2.0, 10);
      expect(notes[1]!.duration).toBeCloseTo(2.0, 10);
      expect(notes[2]!.start_time).toBeCloseTo(3.0, 10);
      expect(notes[2]!.duration).toBeCloseTo(2.0, 10);
    });
  });

  describe("regression tests for 4/4", () => {
    it("4/4 behavior unchanged (factor = 1.0)", () => {
      const notes = createTestNote({ start_time: 1.0, duration: 1.0 });

      applyTransforms(notes, "timing += 1\nduration += 0.5", 4, 4);
      expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      expect(notes[0]!.duration).toBeCloseTo(1.5, 10);
    });

    it("4/4 set operator unchanged", () => {
      const notes = createTestNote({ start_time: 5.0, duration: 3.0 });

      applyTransforms(notes, "timing = 2\nduration = 1", 4, 4);
      expect(notes[0]!.start_time).toBeCloseTo(2.0, 10);
      expect(notes[0]!.duration).toBeCloseTo(1.0, 10);
    });

    it("4/4 note.duration variable unchanged", () => {
      const notes = createTestNote({ duration: 2.0, velocity_deviation: 0 });

      applyTransforms(notes, "velocity = note.duration * 10", 4, 4);
      expect(notes[0]!.velocity).toBeCloseTo(20, 5);
    });
  });
});
