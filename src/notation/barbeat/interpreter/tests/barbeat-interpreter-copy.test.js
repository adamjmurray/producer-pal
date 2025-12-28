import { describe, expect, it } from "vitest";
import { interpretNotation } from "../barbeat-interpreter.js";

describe("bar|beat interpretNotation() - bar copy operations", () => {
  describe("bar copy", () => {
    it("copies a single bar to a different position", () => {
      const result = interpretNotation("C3 D3 E3 1|1 @2=1");

      expect(result).toStrictEqual([
        // Bar 1
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
        // Bar 2 (copied)
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
    it("copies previous bar with @N= syntax", () => {
      const result = interpretNotation("C3 1|1 @2=");

      expect(result).toStrictEqual([
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
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("copies a range of bars", () => {
      const result = interpretNotation("C3 1|1 D3 2|1 @5=1-2");

      expect(result).toStrictEqual([
        // Bar 1
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 5 (copy of bar 1)
        {
          pitch: 60,
          start_time: 16,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 6 (copy of bar 2)
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
    it("supports chained copies", () => {
      const result = interpretNotation("C3 1|1 @2= @3= @4=");

      expect(result).toStrictEqual([
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
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("overlays notes after copy", () => {
      const result = interpretNotation("C3 1|1 @2=1 D3 |2");

      expect(result).toStrictEqual([
        // Bar 1
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (copied C3)
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 beat 2 (added D3)
        {
          pitch: 62,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("accumulates notes in chained copies", () => {
      // Without auto-clear: bar 2 gets C3 from bar 1, then D3 is added
      // bar 3 gets both C3 and D3 from bar 2
      const result = interpretNotation("C3 1|1 @2= D3 |2 @3=");

      expect(result).toStrictEqual([
        // Bar 1
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (copied C3)
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 beat 2 (D3 added)
        {
          pitch: 62,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 3 (copied both C3 and D3 from bar 2)
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
          start_time: 9,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("preserves note properties (velocity, duration, probability)", () => {
      const result = interpretNotation("v80 t0.5 p0.7 C3 1|1 @2=1");

      expect(result).toStrictEqual([
        // Bar 1
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 80,
          probability: 0.7,
          velocity_deviation: 0,
        },
        // Bar 2 (copied with same properties)
        {
          pitch: 60,
          start_time: 4,
          duration: 0.5,
          velocity: 80,
          probability: 0.7,
          velocity_deviation: 0,
        },
      ]);
    });
    it("handles different time signatures", () => {
      const result = interpretNotation("C3 1|1 @2=1", {
        timeSigNumerator: 3,
        timeSigDenominator: 4,
      });

      expect(result).toStrictEqual([
        // Bar 1 (3/4 time)
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (3 beats later in 3/4)
        {
          pitch: 60,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("handles 6/8 time signature correctly", () => {
      const result = interpretNotation("C3 1|1 @2=1", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });

      expect(result).toStrictEqual([
        // Bar 1 (6/8 time = 3 quarter notes per bar)
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (3 quarter notes later)
        {
          pitch: 60,
          start_time: 3,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("handles multiple notes at different beats", () => {
      const result = interpretNotation("C3 1|1 D3 1|2 E3 1|3 @2=1");

      expect(result).toStrictEqual([
        // Bar 1
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
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (copied with correct offsets)
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
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 6,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("updates current time position after copy", () => {
      const result = interpretNotation("C3 1|1 @2=1 D3 |2");

      // After @2=1, current time should be 2|1
      // So |2 should mean 2|2
      expect(result).toStrictEqual([
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
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("only copies notes within bar time range, not all notes from multi-bar beat list", () => {
      // Regression test for "copy bleeding" bug
      // Multi-bar beat list creates notes across bars 1-8
      // @16=1 should only copy bar 1's notes (beats 1 and 3), not all 16 notes
      const result = interpretNotation(
        "C1 1|1,5,9,13,17,21,25,29 |3,7,11,15,19,23,27,31 @16=1",
      );

      // Should have 18 notes: 16 original (bars 1-8) + 2 copied (bar 16)
      expect(result).toHaveLength(18);

      // Verify bar 1 notes exist
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 0.0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 2.0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 16 has ONLY the 2 notes from bar 1
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 60.0, // Bar 16 beat 1
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 62.0, // Bar 16 beat 3
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 17 does NOT have notes (bug would copy bars 2-8 to bars 17-23)
      const bar17Notes = result.filter(
        (n) => n.start_time >= 64.0 && n.start_time < 68.0,
      );

      expect(bar17Notes).toHaveLength(0);
    });

    it("only copies notes within bar time range with 6/8 time signature", () => {
      // Regression test for "copy bleeding" bug with different time signature
      // In 6/8, each bar = 3.0 Ableton beats (6 beats * 4/8)
      // Beat list 1|1,4,7,10 spans bars 1-2 (beats 7,10 overflow to bar 2)
      const result = interpretNotation("C1 1|1,4,7,10 @3=1", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });

      // Should have 6 notes: 4 original (bars 1-2) + 2 copied (bar 3)
      expect(result).toHaveLength(6);

      // Verify bar 1 notes (beats 1 and 4)
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 0.0, // Bar 1 beat 1
        duration: 0.5, // 1 beat * (4/8) = 0.5 Ableton beats
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 1.5, // Bar 1 beat 4 = (4-1) * 0.5
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 2 notes (beats 7 and 10 overflow from bar 1)
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 3.0, // Bar 2 beat 1 (beat 7 overflowed)
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 4.5, // Bar 2 beat 4 (beat 10 overflowed)
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 3 has ONLY the 2 notes from bar 1
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 6.0, // Bar 3 beat 1
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 7.5, // Bar 3 beat 4
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 4 does NOT have notes (bug would copy bar 2's notes)
      const bar4Notes = result.filter(
        (n) => n.start_time >= 9.0 && n.start_time < 12.0,
      );

      expect(bar4Notes).toHaveLength(0);
    });
  });
});
