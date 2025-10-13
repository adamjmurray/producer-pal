import { describe, it, expect } from "vitest";
import { interpretNotation } from "./stark-interpreter.js";

describe("stark-interpreter", () => {
  describe("drums mode", () => {
    it("should parse basic kick pattern", () => {
      const result = interpretNotation("kick: X x X x");
      expect(result).toHaveLength(4);
      expect(result[0].pitch).toBe(36); // C1
      expect(result[0].start_time).toBe(0);
      expect(result[0].duration).toBe(1.0);
      expect(result[0].velocity).toBeGreaterThanOrEqual(100);
      expect(result[0].velocity).toBeLessThanOrEqual(110);
    });

    it("should parse multiple drum lines", () => {
      const result = interpretNotation("kick: X . X .\nsnare: . X . X");
      expect(result).toHaveLength(4);

      // Check kicks
      const kicks = result.filter((n) => n.pitch === 36);
      expect(kicks).toHaveLength(2);
      expect(kicks[0].start_time).toBe(0);
      expect(kicks[1].start_time).toBe(2);

      // Check snares
      const snares = result.filter((n) => n.pitch === 38);
      expect(snares).toHaveLength(2);
      expect(snares[0].start_time).toBe(1);
      expect(snares[1].start_time).toBe(3);
    });

    it("should handle 16th notes", () => {
      const result = interpretNotation("hihat: xxxx");
      expect(result).toHaveLength(4);
      expect(result[0].start_time).toBe(0);
      expect(result[1].start_time).toBe(0.25);
      expect(result[2].start_time).toBe(0.5);
      expect(result[3].start_time).toBe(0.75);
      expect(result[0].duration).toBe(0.25);
    });

    it("should handle bar markers", () => {
      const result = interpretNotation("kick: X x / X x");
      expect(result).toHaveLength(4);
      expect(result[0].start_time).toBe(0);
      expect(result[1].start_time).toBe(1);
      expect(result[2].start_time).toBe(4); // Start of bar 2
      expect(result[3].start_time).toBe(5);
    });

    it("should handle different velocities", () => {
      const result = interpretNotation("kick: X x ^");
      expect(result).toHaveLength(3);

      // Loud
      expect(result[0].velocity).toBeGreaterThanOrEqual(100);
      expect(result[0].velocity).toBeLessThanOrEqual(110);

      // Soft
      expect(result[1].velocity).toBeGreaterThanOrEqual(60);
      expect(result[1].velocity).toBeLessThanOrEqual(80);

      // Accent
      expect(result[2].velocity).toBeGreaterThanOrEqual(115);
      expect(result[2].velocity).toBeLessThanOrEqual(127);
    });

    it("should handle sustain as rest for drums", () => {
      const result = interpretNotation("kick: X - X");
      expect(result).toHaveLength(2);
      expect(result[0].start_time).toBe(0);
      expect(result[1].start_time).toBe(2);
    });
  });

  describe("bass mode", () => {
    it("should parse basic bass line in C major", () => {
      const result = interpretNotation("bass: C D E F", {
        scale: "C Major",
      });
      expect(result).toHaveLength(4);

      // C2, D2, E2, F2 (default bass octave is 2)
      expect(result[0].pitch).toBe(36); // C2
      expect(result[1].pitch).toBe(38); // D2
      expect(result[2].pitch).toBe(40); // E2
      expect(result[3].pitch).toBe(41); // F2
    });

    it("should apply scale accidentals", () => {
      const result = interpretNotation("bass: A B D E", {
        scale: "Ab Major",
      });

      // In Ab Major: A→Ab, B→Bb, D→Db, E→Eb
      // Ab2=32, Bb2=34, Db2=37, Eb2=39
      expect(result[0].pitch).toBe(32); // Ab2
      expect(result[1].pitch).toBe(34); // Bb2
      expect(result[2].pitch).toBe(37); // Db2
      expect(result[3].pitch).toBe(39); // Eb2
    });

    it("should choose closest octave", () => {
      const result = interpretNotation("bass: B C", {
        scale: "C Major",
      });

      // B2→C3 (closest is up), not B2→C2 (down a 7th)
      expect(result[0].pitch).toBe(35); // B2
      expect(result[1].pitch).toBe(36); // C3
    });

    it("should handle bar markers", () => {
      const result = interpretNotation("bass: C / E", {
        scale: "C Major",
      });

      expect(result).toHaveLength(2);
      expect(result[0].start_time).toBe(0);
      expect(result[1].start_time).toBe(4); // Start of bar 2
    });

    it("should handle sustain", () => {
      const result = interpretNotation("bass: C - - E", {
        scale: "C Major",
      });

      expect(result).toHaveLength(2);
      expect(result[0].duration).toBe(3.0); // Extended by 2 sustains
      expect(result[1].start_time).toBe(3);
    });

    it("should handle dynamics", () => {
      const result = interpretNotation("bass: C c", {
        scale: "C Major",
      });

      // Uppercase = loud
      expect(result[0].velocity).toBeGreaterThanOrEqual(100);
      expect(result[0].velocity).toBeLessThanOrEqual(110);

      // Lowercase = soft
      expect(result[1].velocity).toBeGreaterThanOrEqual(60);
      expect(result[1].velocity).toBeLessThanOrEqual(80);
    });

    it("should handle 16th notes", () => {
      const result = interpretNotation("bass: CDEF", {
        scale: "C Major",
      });

      expect(result).toHaveLength(4);
      expect(result[0].duration).toBe(0.25);
      expect(result[1].start_time).toBe(0.25);
      expect(result[2].start_time).toBe(0.5);
      expect(result[3].start_time).toBe(0.75);
    });
  });

  describe("melody mode", () => {
    it("should parse basic melody in C major", () => {
      const result = interpretNotation("melody: E G A", {
        scale: "C Major",
      });

      // E4, G4, A4 (default melody octave is 4)
      expect(result).toHaveLength(3);
      expect(result[0].pitch).toBe(64); // E4
      expect(result[1].pitch).toBe(67); // G4
      expect(result[2].pitch).toBe(69); // A4
    });

    it("should have different octave range than bass", () => {
      const bassResult = interpretNotation("bass: C", { scale: "C Major" });
      const melodyResult = interpretNotation("melody: C", { scale: "C Major" });

      expect(bassResult[0].pitch).toBe(36); // C2
      expect(melodyResult[0].pitch).toBe(60); // C4
    });
  });

  describe("chords mode", () => {
    it("should parse basic chord progression in C major", () => {
      const result = interpretNotation("chords: C F G C", {
        scale: "C Major",
      });

      // Each chord = 3 notes (triad)
      expect(result).toHaveLength(12);

      // C major chord (C E G) at octave 3
      const cChord = result.slice(0, 3);
      expect(cChord[0].pitch).toBe(48); // C3
      expect(cChord[1].pitch).toBe(52); // E3
      expect(cChord[2].pitch).toBe(55); // G3
    });

    it("should infer chord quality from scale degree", () => {
      const result = interpretNotation("chords: D", {
        scale: "C Major",
      });

      // D in C major = ii = D minor (D F A)
      expect(result).toHaveLength(3);
      expect(result[0].pitch).toBe(50); // D3
      expect(result[1].pitch).toBe(53); // F3
      expect(result[2].pitch).toBe(57); // A3
    });

    it("should handle 7th chords", () => {
      const result = interpretNotation("chords: C7", {
        scale: "C Major",
      });

      // C major 7th = C E G B
      expect(result).toHaveLength(4);
      expect(result[0].pitch).toBe(48); // C3
      expect(result[1].pitch).toBe(52); // E3
      expect(result[2].pitch).toBe(55); // G3
      expect(result[3].pitch).toBe(59); // B3
    });

    it("should handle dynamics", () => {
      const result = interpretNotation("chords: C f", {
        scale: "C Major",
      });

      // C = loud (first 3 notes)
      expect(result[0].velocity).toBeGreaterThanOrEqual(100);
      expect(result[0].velocity).toBeLessThanOrEqual(110);

      // f = soft (next 3 notes)
      expect(result[3].velocity).toBeGreaterThanOrEqual(60);
      expect(result[3].velocity).toBeLessThanOrEqual(80);
    });

    it("should handle bar markers", () => {
      const result = interpretNotation("chords: C / F", {
        scale: "C Major",
      });

      expect(result).toHaveLength(6);
      expect(result[0].start_time).toBe(0);
      expect(result[3].start_time).toBe(4); // Start of bar 2
    });
  });

  describe("edge cases", () => {
    it("should return empty array for empty input", () => {
      expect(interpretNotation("")).toEqual([]);
      expect(interpretNotation("  ")).toEqual([]);
    });

    it("should default to C Major when no scale provided", () => {
      const result = interpretNotation("melody: C");
      expect(result).toHaveLength(1);
      expect(result[0].pitch).toBe(60); // C4 in C major
    });

    it("should handle different time signatures", () => {
      const result = interpretNotation("kick: X x / X x", {
        timeSigNumerator: 3,
      });

      expect(result).toHaveLength(4);
      expect(result[2].start_time).toBe(3); // Start of bar 2 in 3/4
    });
  });
});
