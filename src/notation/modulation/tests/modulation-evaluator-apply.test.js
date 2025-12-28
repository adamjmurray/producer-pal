import { describe, expect, it } from "vitest";
import { applyModulations } from "../modulation-evaluator.js";

describe("applyModulations", () => {
  describe("basic functionality", () => {
    it("does nothing with null modulation string", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, null, 4, 4);
      expect(notes[0].velocity).toBe(100);
    });

    it("does nothing with empty modulation string", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "", 4, 4);
      expect(notes[0].velocity).toBe(100);
    });

    it("does nothing with empty notes array", () => {
      const notes = [];

      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes).toStrictEqual([]);
    });

    it("applies simple velocity modulation with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes[0].velocity).toBe(110);
    });

    it("applies simple velocity modulation with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity = 64", 4, 4);
      expect(notes[0].velocity).toBe(64);
    });

    it("modifies notes in-place", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      const originalNotes = notes;

      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes).toBe(originalNotes);
    });
  });

  describe("range clamping", () => {
    it("clamps velocity to minimum 1 with += operator", () => {
      const notes = [
        { pitch: 60, start_time: 0, duration: 1, velocity: 10, probability: 1 },
      ];

      applyModulations(notes, "velocity += -100", 4, 4);
      expect(notes[0].velocity).toBe(1);
    });

    it("clamps velocity to maximum 127 with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity += 100", 4, 4);
      expect(notes[0].velocity).toBe(127);
    });

    it("clamps velocity to minimum 1 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity = 0", 4, 4);
      expect(notes[0].velocity).toBe(1);
    });

    it("clamps velocity to maximum 127 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity = 200", 4, 4);
      expect(notes[0].velocity).toBe(127);
    });

    it("clamps duration to minimum 0.001 with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "duration += -1", 4, 4);
      expect(notes[0].duration).toBe(0.001);
    });

    it("clamps duration to minimum 0.001 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "duration = -1", 4, 4);
      expect(notes[0].duration).toBe(0.001);
    });

    it("clamps probability to minimum 0.0 with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 0.5,
        },
      ];

      applyModulations(notes, "probability += -1", 4, 4);
      expect(notes[0].probability).toBe(0.0);
    });

    it("clamps probability to maximum 1.0 with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 0.5,
        },
      ];

      applyModulations(notes, "probability += 1", 4, 4);
      expect(notes[0].probability).toBe(1.0);
    });

    it("clamps probability to minimum 0.0 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "probability = -0.5", 4, 4);
      expect(notes[0].probability).toBe(0.0);
    });

    it("clamps probability to maximum 1.0 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "probability = 2.0", 4, 4);
      expect(notes[0].probability).toBe(1.0);
    });

    it("modifies timing without clamping with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "timing += 0.5", 4, 4);
      expect(notes[0].start_time).toBe(2.5);
    });

    it("sets timing without clamping with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "timing = 5", 4, 4);
      expect(notes[0].start_time).toBe(5);
    });
  });

  describe("multi-parameter modulation", () => {
    it("applies multiple modulations to same note", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      const modString = `velocity += 10
timing += 0.05
duration += 0.5
probability += -0.2`;

      applyModulations(notes, modString, 4, 4);
      expect(notes[0].velocity).toBe(110);
      expect(notes[0].start_time).toBe(0.05);
      expect(notes[0].duration).toBe(1.5);
      expect(notes[0].probability).toBe(0.8);
    });

    it("applies modulations to multiple notes", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        { pitch: 64, start_time: 1, duration: 1, velocity: 80, probability: 1 },
        { pitch: 67, start_time: 2, duration: 1, velocity: 90, probability: 1 },
      ];

      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes[0].velocity).toBe(110);
      expect(notes[1].velocity).toBe(90);
      expect(notes[2].velocity).toBe(100);
    });
  });

  describe("time signature handling", () => {
    it("handles 4/4 time signature", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      // In 4/4, 1 Ableton beat = 1 musical beat, so cos(1t) at position 0 = 1
      applyModulations(notes, "velocity += 20 * cos(1t)", 4, 4);
      expect(notes[0].velocity).toBeCloseTo(120, 5);
    });

    it("handles 3/4 time signature", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      // In 3/4, 1 Ableton beat = 1 musical beat
      applyModulations(notes, "velocity += 20 * cos(1t)", 3, 4);
      expect(notes[0].velocity).toBeCloseTo(120, 5);
    });

    it("handles 6/8 time signature", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      // In 6/8, 1 Ableton beat = 2 musical beats (denominator/4 = 8/4 = 2)
      applyModulations(notes, "velocity += 20 * cos(1t)", 6, 8);
      expect(notes[0].velocity).toBeCloseTo(120, 5);
    });

    it("correctly calculates musical beats for different positions in 4/4", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 60,
          start_time: 0.5,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 60,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      // cos(1t) completes one cycle per beat: 0→1, 0.5→-1, 1→1
      applyModulations(notes, "velocity += 20 * cos(1t)", 4, 4);
      expect(notes[0].velocity).toBeCloseTo(120, 5); // cos(0) = 1
      expect(notes[1].velocity).toBeCloseTo(80, 5); // cos(0.5) ≈ -1
      expect(notes[2].velocity).toBeCloseTo(120, 5); // cos(1) = 1
    });
  });

  describe("pitch filtering", () => {
    it("applies modulation only to matching pitch", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "C3 velocity += 20", 4, 4);
      expect(notes[0].velocity).toBe(120);
      expect(notes[1].velocity).toBe(100); // unchanged
    });

    it("applies modulation to all pitches when no filter specified", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity += 20", 4, 4);
      expect(notes[0].velocity).toBe(120);
      expect(notes[1].velocity).toBe(120);
    });
  });

  describe("time range filtering", () => {
    it("applies modulation only within time range", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        }, // bar 1, beat 1
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1,
        }, // bar 2, beat 1
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1,
        }, // bar 3, beat 1
      ];

      applyModulations(notes, "1|1-2|4 velocity += 20", 4, 4);
      expect(notes[0].velocity).toBe(120); // in range
      expect(notes[1].velocity).toBe(120); // in range
      expect(notes[2].velocity).toBe(100); // out of range
    });
  });

  describe("edge cases", () => {
    it("handles notes with velocity at lower boundary", () => {
      const notes = [
        { pitch: 60, start_time: 0, duration: 1, velocity: 1, probability: 1 },
      ];

      applyModulations(notes, "velocity += -10", 4, 4);
      expect(notes[0].velocity).toBe(1);
    });

    it("handles notes with velocity at upper boundary", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 127,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes[0].velocity).toBe(127);
    });

    it("handles notes with very small duration", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.001,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "duration += -0.01", 4, 4);
      expect(notes[0].duration).toBe(0.001);
    });

    it("handles notes with probability at boundaries", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 0,
        },
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyModulations(notes, "probability += 0.5", 4, 4);
      expect(notes[0].probability).toBe(0.5);
      expect(notes[1].probability).toBe(1.0); // clamped
    });
  });

  describe("note property variables", () => {
    it("applies modulation using note.pitch variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
        {
          pitch: 72,
          start_time: 1,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity = note.pitch", 4, 4);
      expect(notes[0].velocity).toBe(60);
      expect(notes[1].velocity).toBe(72);
    });

    it("applies modulation using note.velocity variable (self-reference)", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity = note.velocity / 2", 4, 4);
      expect(notes[0].velocity).toBe(50);
    });

    it("applies modulation using note.velocityDeviation variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 20,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity += note.velocityDeviation", 4, 4);
      expect(notes[0].velocity).toBe(120);
    });

    it("applies modulation using note.duration variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];

      applyModulations(notes, "probability = note.duration", 4, 4);
      expect(notes[0].probability).toBe(0.5);
    });

    it("applies modulation using note.probability variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 0.5,
        },
      ];

      applyModulations(notes, "velocity = note.probability * 127", 4, 4);
      expect(notes[0].velocity).toBeCloseTo(63.5, 1);
    });

    it("applies modulation using note.start variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
        {
          pitch: 60,
          start_time: 1,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];

      // In 4/4, start_time 0 = 0 beats, start_time 1 = 1 beat
      applyModulations(notes, "velocity = 64 + note.start * 10", 4, 4);
      expect(notes[0].velocity).toBe(64); // 64 + 0 * 10
      expect(notes[1].velocity).toBe(74); // 64 + 1 * 10
    });

    it("applies different modulations to different notes based on their properties", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.25,
          velocity: 80,
          velocity_deviation: 0,
          probability: 1,
        },
        {
          pitch: 72,
          start_time: 1,
          duration: 0.5,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];

      applyModulations(
        notes,
        "velocity = note.pitch + note.duration * 20",
        4,
        4,
      );
      expect(notes[0].velocity).toBe(65); // 60 + 0.25 * 20
      expect(notes[1].velocity).toBe(82); // 72 + 0.5 * 20
    });

    it("combines note variables with waveforms", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];

      applyModulations(notes, "velocity = note.velocity * cos(1t)", 4, 4);
      expect(notes[0].velocity).toBeCloseTo(100, 5); // 100 * cos(0) = 100 * 1
    });
  });
});
