import { describe, expect, it } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";

describe("applyTransforms - pitch transforms", () => {
  describe("basic pitch operations", () => {
    it("applies pitch set transform", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = 72", 4, 4);
      expect(notes[0]!.pitch).toBe(72);
    });

    it("applies pitch add transform (transpose up)", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch += 12", 4, 4);
      expect(notes[0]!.pitch).toBe(72);
    });

    it("applies pitch add transform (transpose down)", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch += -12", 4, 4);
      expect(notes[0]!.pitch).toBe(48);
    });

    it("applies pitch to multiple notes", () => {
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
        {
          pitch: 67,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch += 12", 4, 4);
      expect(notes[0]!.pitch).toBe(72);
      expect(notes[1]!.pitch).toBe(76);
      expect(notes[2]!.pitch).toBe(79);
    });
  });

  describe("pitch literals", () => {
    it("applies pitch literal in expression", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = C4", 4, 4); // C4 = 72
      expect(notes[0]!.pitch).toBe(72);
    });

    it("applies pitch literal with arithmetic", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = F#3 + 7", 4, 4); // F#3 = 66, + 7 = 73
      expect(notes[0]!.pitch).toBe(73);
    });

    it("applies pitch literal C3 as middle C", () => {
      const notes = [
        {
          pitch: 72,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = C3", 4, 4); // C3 = 60 (middle C)
      expect(notes[0]!.pitch).toBe(60);
    });
  });

  describe("clamping", () => {
    it("clamps pitch to minimum 0", () => {
      const notes = [
        {
          pitch: 10,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch += -50", 4, 4);
      expect(notes[0]!.pitch).toBe(0);
    });

    it("clamps pitch to maximum 127", () => {
      const notes = [
        {
          pitch: 100,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch += 50", 4, 4);
      expect(notes[0]!.pitch).toBe(127);
    });

    it("clamps pitch at 0 boundary with set operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = -10", 4, 4);
      expect(notes[0]!.pitch).toBe(0);
    });

    it("clamps pitch at 127 boundary with set operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = 200", 4, 4);
      expect(notes[0]!.pitch).toBe(127);
    });
  });

  describe("rounding", () => {
    it("rounds fractional pitch values up at 0.5", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = 60.7", 4, 4);
      expect(notes[0]!.pitch).toBe(61);
    });

    it("rounds down when below 0.5", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = 60.3", 4, 4);
      expect(notes[0]!.pitch).toBe(60);
    });

    it("rounds at exactly 0.5", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = 60.5", 4, 4);
      expect(notes[0]!.pitch).toBe(61); // Math.round rounds 0.5 up
    });

    it("rounds fractional pitch values from note.velocity", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = note.velocity / 2", 4, 4); // 100/2 = 50
      expect(notes[0]!.pitch).toBe(50);
    });
  });

  describe("filtering", () => {
    it("applies pitch transform with pitch range filter", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 72,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "C3 pitch += 12", 4, 4); // Only transpose C3 (60)
      expect(notes[0]!.pitch).toBe(72); // Was 60, now 72
      expect(notes[1]!.pitch).toBe(72); // Unchanged (wasn't in C3 range)
    });

    it("applies pitch transform with time range filter", () => {
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
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "1|1-1|4 pitch += 12", 4, 4);
      expect(notes[0]!.pitch).toBe(72); // In time range
      expect(notes[1]!.pitch).toBe(60); // Out of time range
    });
  });

  describe("note variables", () => {
    it("applies pitch transform using note.pitch variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];

      applyTransforms(notes, "pitch = note.pitch + 7", 4, 4);
      expect(notes[0]!.pitch).toBe(67);
    });

    it("uses note.velocity in pitch expression", () => {
      const notes = [
        { pitch: 60, start_time: 0, duration: 1, velocity: 64, probability: 1 },
      ];

      applyTransforms(notes, "pitch = note.velocity", 4, 4);
      expect(notes[0]!.pitch).toBe(64);
    });
  });
});
