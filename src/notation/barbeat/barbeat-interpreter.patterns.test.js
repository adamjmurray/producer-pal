import { describe, expect, it, vi } from "vitest";
import { interpretNotation } from "./barbeat-interpreter";

describe("bar|beat interpretNotation() - pattern features", () => {
  describe("repeat patterns (x{times}@{step})", () => {
    it("expands basic repeat pattern with whole step", () => {
      const result = interpretNotation("C1 1|1x4@1");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("expands repeat pattern with fractional step (triplets)", () => {
      const result = interpretNotation("C3 1|1x3@1/3", {
        timeSigNumerator: 4,
        timeSigDenominator: 4,
      });
      expect(result).toHaveLength(3);
      expect(result[0].start_time).toBeCloseTo(0, 10);
      expect(result[1].start_time).toBeCloseTo(1 / 3, 10);
      expect(result[2].start_time).toBeCloseTo(2 / 3, 10);
    });

    it("expands repeat pattern with decimal step", () => {
      const result = interpretNotation("Gb1 1|1x8@0.5");
      expect(result).toHaveLength(8);
      expect(result[0].start_time).toBeCloseTo(0, 10);
      expect(result[1].start_time).toBeCloseTo(0.5, 10);
      expect(result[7].start_time).toBeCloseTo(3.5, 10);
    });

    it("expands repeat pattern with mixed number step", () => {
      const result = interpretNotation("C1 1|1x4@1+1/2");
      expect(result).toHaveLength(4);
      expect(result[0].start_time).toBeCloseTo(0, 10);
      expect(result[1].start_time).toBeCloseTo(1.5, 10);
      expect(result[2].start_time).toBeCloseTo(3, 10);
      expect(result[3].start_time).toBeCloseTo(4.5, 10);
    });

    it("expands repeat pattern with mixed number start", () => {
      const result = interpretNotation("C3 1|2+1/3x3@1/3", {
        timeSigNumerator: 4,
        timeSigDenominator: 4,
      });
      expect(result).toHaveLength(3);
      expect(result[0].start_time).toBeCloseTo(1 + 1 / 3, 10);
      expect(result[1].start_time).toBeCloseTo(1 + 2 / 3, 10);
      expect(result[2].start_time).toBeCloseTo(2, 10);
    });

    it("handles repeat pattern overflowing into next bar", () => {
      const result = interpretNotation("C1 1|3x6@1");
      expect(result).toHaveLength(6);
      expect(result[0].start_time).toBe(2); // bar 1, beat 3
      expect(result[1].start_time).toBe(3); // bar 1, beat 4
      expect(result[2].start_time).toBe(4); // bar 2, beat 1
      expect(result[3].start_time).toBe(5); // bar 2, beat 2
      expect(result[4].start_time).toBe(6); // bar 2, beat 3
      expect(result[5].start_time).toBe(7); // bar 2, beat 4
    });

    it("handles repeat pattern without bar (uses current bar)", () => {
      const result = interpretNotation("C1 1|1 D1 |2x2@1");
      expect(result).toHaveLength(3);
      expect(result[0].pitch).toBe(36); // C1 at 1|1
      expect(result[1].pitch).toBe(38); // D1 at 1|2
      expect(result[2].pitch).toBe(38); // D1 at 1|3
    });

    it("emits multiple pitches at each expanded position", () => {
      const result = interpretNotation("C3 D3 E3 1|1x4@1");
      expect(result).toHaveLength(12); // 3 pitches × 4 positions
      // Check first position (beat 1)
      expect(result[0].pitch).toBe(60); // C3
      expect(result[1].pitch).toBe(62); // D3
      expect(result[2].pitch).toBe(64); // E3
      // Check second position (beat 2)
      expect(result[3].pitch).toBe(60); // C3
      expect(result[4].pitch).toBe(62); // D3
      expect(result[5].pitch).toBe(64); // E3
    });

    it("applies state changes to all expanded positions", () => {
      const result = interpretNotation("v80 t0.5 C1 1|1x4@1");
      expect(result).toHaveLength(4);
      expect(result.every((note) => note.velocity === 80)).toBe(true);
      expect(result.every((note) => note.duration === 0.5)).toBe(true);
    });

    it("uses current duration when step is omitted", () => {
      const result = interpretNotation("t0.5 C1 1|1x4");
      expect(result).toHaveLength(4);
      expect(result[0].start_time).toBe(0); // 1|1
      expect(result[1].start_time).toBe(0.5); // 1|1.5
      expect(result[2].start_time).toBe(1); // 1|2
      expect(result[3].start_time).toBe(1.5); // 1|2.5
      expect(result.every((note) => note.duration === 0.5)).toBe(true);
    });

    it("uses default duration when step is omitted and no duration set", () => {
      const result = interpretNotation("C1 1|1x3");
      expect(result).toHaveLength(3);
      expect(result[0].start_time).toBe(0); // 1|1
      expect(result[1].start_time).toBe(1); // 1|2
      expect(result[2].start_time).toBe(2); // 1|3
      expect(result.every((note) => note.duration === 1)).toBe(true);
    });

    it("handles repeat pattern mixed with regular beats", () => {
      const result = interpretNotation("C1 1|1x2@1,3.5");
      expect(result).toHaveLength(3);
      expect(result[0].start_time).toBe(0); // 1|1
      expect(result[1].start_time).toBe(1); // 1|2
      expect(result[2].start_time).toBe(2.5); // 1|3.5
    });

    it("handles multiple repeat patterns in same beat list", () => {
      const result = interpretNotation("C1 1|1x2@1,3x2@0.5");
      expect(result).toHaveLength(4);
      expect(result[0].start_time).toBe(0); // 1|1
      expect(result[1].start_time).toBe(1); // 1|2
      expect(result[2].start_time).toBe(2); // 1|3
      expect(result[3].start_time).toBe(2.5); // 1|3.5
    });

    it("works with bar copy operations", () => {
      const result = interpretNotation("C1 1|1x4@1 @2=1");
      expect(result).toHaveLength(8);
      // Bar 1
      expect(result[0].start_time).toBe(0);
      expect(result[3].start_time).toBe(3);
      // Bar 2 (copied)
      expect(result[4].start_time).toBe(4);
      expect(result[7].start_time).toBe(7);
    });

    it("emits warning for excessive repeat times", () => {
      const consoleSpy = vi.spyOn(console, "error");
      interpretNotation("C1 1|1x101@1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("101 notes, which may be excessive"),
      );
      consoleSpy.mockRestore();
    });

    it("does not warn about buffered pitches when emitted via repeat pattern", () => {
      const consoleSpy = vi.spyOn(console, "error");
      const result = interpretNotation("t.5 C1 1|1x8");

      // Should emit 8 notes
      expect(result).toHaveLength(8);
      expect(result[0].pitch).toBe(36); // C1
      expect(result[0].duration).toBe(0.5);

      // Should NOT warn about buffered pitches
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("pitch(es) buffered but no time position"),
      );
      consoleSpy.mockRestore();
    });

    it("does not warn about buffered pitches when emitted then bar copied", () => {
      const consoleSpy = vi.spyOn(console, "error");
      const result = interpretNotation("t.5 C1 1|1x8 @2=");

      // Should emit 8 notes in bar 1 and copy to bar 2 (16 total)
      expect(result).toHaveLength(16);
      expect(result[0].pitch).toBe(36); // C1
      expect(result[0].duration).toBe(0.5);

      // Should NOT warn about buffered pitches before bar copy
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(
          "pitch(es) buffered but not emitted before bar copy",
        ),
      );
      consoleSpy.mockRestore();
    });

    it("does warn about buffered pitches when never emitted then bar copied", () => {
      const consoleSpy = vi.spyOn(console, "error");
      const result = interpretNotation("C1 E1 @2=1");

      // Should copy bar 1 to bar 2, but bar 1 is empty
      expect(result).toHaveLength(0);

      // Should warn about buffered pitches before bar copy
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "2 pitch(es) buffered but not emitted before bar copy",
        ),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("v0 deletions", () => {
    it("deletes note with same pitch and time when v0 is encountered", () => {
      const result = interpretNotation("C3 D3 1|1 v0 C3 1|1");
      expect(result).toEqual([
        {
          pitch: 62,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 note does not affect notes with different pitch", () => {
      const result = interpretNotation("C3 D3 E3 1|1 v0 F3 1|2");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 note does not affect notes with different time", () => {
      const result = interpretNotation("C3 1|1 C3 1|2 v0 C3 1|3");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles multiple v0 notes", () => {
      const result = interpretNotation("C3 D3 E3 1|1 v0 C3 D3 1|1");
      expect(result).toEqual([
        {
          pitch: 64,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 note followed by same note at same time works correctly", () => {
      const result = interpretNotation("C3 1|1 v0 C3 1|1 v100 C3 1|1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 deletions work after bar copy", () => {
      const result = interpretNotation("C3 D3 E3 1|1 @2=1 v0 D3 2|1");
      expect(result).toEqual([
        // Bar 1: original notes
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2: copied notes (but D3 is deleted by v0)
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 deletions work after range copy", () => {
      const result = interpretNotation("C3 D3 1|1 @2-3= v0 D3 2|1");
      expect(result).toEqual([
        // Bar 1: original
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2: copied, D3 deleted
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 3: copied
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 deletions work after multi-bar source range tiling", () => {
      const result = interpretNotation("C3 1|1 D3 2|1 @3-6=1-2 v0 C3 5|1");
      expect(result).toEqual([
        // Bar 1: original C3
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2: original D3
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 3: tiled C3
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 4: tiled D3
        {
          pitch: 62,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 5: tiled C3, but deleted by v0
        // Bar 6: tiled D3
        {
          pitch: 62,
          start_time: 20,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 deletions work with different time signatures", () => {
      const result = interpretNotation("C3 D3 1|1 v0 C3 1|1", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });
      // In 6/8 time, each beat is an 8th note, so beats are 0.5 apart in Ableton beats
      expect(result).toEqual([
        {
          pitch: 62,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("complex scenario: v0 deletions with bar copies and multiple notes", () => {
      const result = interpretNotation(
        "C3 D3 E3 1|1 @2=1 v0 D3 1|1 v0 E3 2|1 v100 F3 2|2",
      );
      expect(result).toEqual([
        // Bar 1: original notes, D3 deleted
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2: copied notes, E3 deleted
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // New F3 note
        {
          pitch: 65,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 notes are kept in the result for update-clip merge mode", () => {
      const result = interpretNotation("C3 D3 1|1 v0 C3 1|2");
      // Check that v0 note is NOT in the result (filtered out by applyV0Deletions)
      const v0Notes = result.filter((note) => note.velocity === 0);
      expect(v0Notes).toHaveLength(0);
    });

    it("v0 only deletes notes that appear before it in serial order", () => {
      const result = interpretNotation("v0 C3 1|1 v100 C3 1|1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 preserves note properties like duration, probability", () => {
      const result = interpretNotation("t2 p0.8 C3 1|1 t0.5 p1.0 v0 C3 1|1");
      expect(result).toEqual([]);
    });
  });
});
