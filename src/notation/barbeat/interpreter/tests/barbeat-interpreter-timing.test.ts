import { describe, expect, it, vi } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";

describe("bar|beat interpretNotation() - timing features", () => {
  describe("time-position-driven note emission", () => {
    it("emits pitch at single time position", () => {
      const result = interpretNotation("C1 1|1");

      expect(result).toStrictEqual([createNote({ pitch: 36 })]);
    });

    it("emits same pitch at multiple times (pitch persistence)", () => {
      const result = interpretNotation("C1 1|1 |2 |3 |4");

      expect(result).toHaveLength(4);
      expect(result.every((n) => n.pitch === 36)).toBe(true);
      expect(result[0]!.start_time).toBe(0);
      expect(result[1]!.start_time).toBe(1);
      expect(result[2]!.start_time).toBe(2);
      expect(result[3]!.start_time).toBe(3);
    });

    it("clears pitch buffer on first pitch after time", () => {
      const result = interpretNotation("C1 1|1 D1 1|2");

      expect(result).toHaveLength(2);
      expect(result[0]!.pitch).toBe(36); // C1
      expect(result[0]!.start_time).toBe(0);
      expect(result[1]!.pitch).toBe(38); // D1
      expect(result[1]!.start_time).toBe(1);
    });

    it("emits chord from buffered pitches", () => {
      const result = interpretNotation("C3 E3 G3 1|1");

      expect(result).toHaveLength(3);
      expect(result.every((n) => n.start_time === 0)).toBe(true);
      expect(result[0]!.pitch).toBe(60); // C3
      expect(result[1]!.pitch).toBe(64); // E3
      expect(result[2]!.pitch).toBe(67); // G3
    });

    it("captures state with each pitch", () => {
      const result = interpretNotation("v100 C3 v80 E3 1|1");

      expect(result).toHaveLength(2);
      expect(result[0]!.pitch).toBe(60); // C3
      expect(result[0]!.velocity).toBe(100);
      expect(result[1]!.pitch).toBe(64); // E3
      expect(result[1]!.velocity).toBe(80);
    });

    it("updates buffered pitches when state changes after time", () => {
      const result = interpretNotation("v100 C4 1|1 v90 |2");

      expect(result).toHaveLength(2);
      expect(result[0]!.pitch).toBe(72); // C4
      expect(result[0]!.velocity).toBe(100);
      expect(result[0]!.start_time).toBe(0);
      expect(result[1]!.pitch).toBe(72); // C4
      expect(result[1]!.velocity).toBe(90);
      expect(result[1]!.start_time).toBe(1);
    });

    it("handles complex state updates with multiple pitches", () => {
      const result = interpretNotation("v80 C4 v90 G4 1|1 v100 |2");

      expect(result).toHaveLength(4);
      // At 1|1: C4@v80, G4@v90
      expect(result[0]!.pitch).toBe(72);
      expect(result[0]!.velocity).toBe(80);
      expect(result[0]!.start_time).toBe(0);
      expect(result[1]!.pitch).toBe(79);
      expect(result[1]!.velocity).toBe(90);
      expect(result[1]!.start_time).toBe(0);
      // At 1|2: C4@v100, G4@v100 (buffer updated)
      expect(result[2]!.pitch).toBe(72);
      expect(result[2]!.velocity).toBe(100);
      expect(result[2]!.start_time).toBe(1);
      expect(result[3]!.pitch).toBe(79);
      expect(result[3]!.velocity).toBe(100);
      expect(result[3]!.start_time).toBe(1);
    });

    it("handles duration updates after time", () => {
      const result = interpretNotation("C4 1|1 t0.5 |2 t0.25 |3");

      expect(result).toHaveLength(3);
      expect(result[0]!.duration).toBe(1);
      expect(result[1]!.duration).toBe(0.5);
      expect(result[2]!.duration).toBe(0.25);
    });

    it("handles probability updates after time", () => {
      const result = interpretNotation("C4 1|1 p0.8 |2 p0.5 |3");

      expect(result).toHaveLength(3);
      expect(result[0]!.probability).toBe(1.0);
      expect(result[1]!.probability).toBe(0.8);
      expect(result[2]!.probability).toBe(0.5);
    });

    it("handles velocity range updates after time", () => {
      const result = interpretNotation("C4 1|1 v80-100 |2");

      expect(result).toHaveLength(2);
      expect(result[0]!.velocity).toBe(100);
      expect(result[0]!.velocity_deviation).toBe(0);
      expect(result[1]!.velocity).toBe(80);
      expect(result[1]!.velocity_deviation).toBe(20);
    });

    it("supports drum patterns", () => {
      const result = interpretNotation("C1 1|1 |2 |3 |4");

      expect(result).toHaveLength(4);
      expect(result.every((n) => n.pitch === 36)).toBe(true);
      expect(result.map((n) => n.start_time)).toStrictEqual([0, 1, 2, 3]);
    });

    it("supports layered drum patterns", () => {
      const result = interpretNotation("C1 1|1 |3  D1 1|2 |4");

      expect(result).toHaveLength(4);
      expect(result[0]!.pitch).toBe(36); // C1 at 1|1
      expect(result[0]!.start_time).toBe(0);
      expect(result[1]!.pitch).toBe(36); // C1 at 1|3
      expect(result[1]!.start_time).toBe(2);
      expect(result[2]!.pitch).toBe(38); // D1 at 1|2
      expect(result[2]!.start_time).toBe(1);
      expect(result[3]!.pitch).toBe(38); // D1 at 1|4
      expect(result[3]!.start_time).toBe(3);
    });

    it("handles state changes between pitches in chord", () => {
      const result = interpretNotation("v80 C4 v90 G4 1|1");

      expect(result).toHaveLength(2);
      expect(result[0]!.velocity).toBe(80);
      expect(result[1]!.velocity).toBe(90);
    });

    it("warns when pitches buffered but no time position", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      interpretNotation("C3 E3 G3");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("3 pitch(es) buffered but no time position"),
      );
      consoleSpy.mockRestore();
    });

    it("warns when time position has no pitches", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      interpretNotation("1|1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Time position 1|1 has no pitches"),
      );
      consoleSpy.mockRestore();
    });

    it("warns when state changes after pitch but before time", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      interpretNotation("C4 v100 1|1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "state change after pitch(es) but before time position won't affect this group",
        ),
      );
      consoleSpy.mockRestore();
    });

    it("does not warn when state changes after pitch but before another pitch", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const result = interpretNotation("v80 C4 v90 G4 1|1");

      expect(result).toHaveLength(2);
      // Should only warn about "state change won't affect group", not about it happening
      const warningCalls = consoleSpy.mock.calls.filter(
        (call) => !call[0].includes("buffered but no time position"),
      );

      expect(warningCalls).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it("does not warn when state changes after time", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const result = interpretNotation("C4 1|1 v90 |2");

      expect(result).toHaveLength(2);
      // Should only warn about "state change won't affect group", not about it happening
      const warningCalls = consoleSpy.mock.calls.filter(
        (call) => !call[0].includes("buffered but no time position"),
      );

      expect(warningCalls).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });

  describe("|beat shortcut syntax", () => {
    it("uses |beat shortcut within same bar", () => {
      const result = interpretNotation("C3 1|1 |2 |3");

      expect(result).toStrictEqual([
        createNote(), // bar 1, beat 1
        createNote({ start_time: 1 }), // bar 1, beat 2
        createNote({ start_time: 2 }), // bar 1, beat 3
      ]);
    });

    it("uses |beat shortcut after bar change", () => {
      const result = interpretNotation("C3 1|1 D3 2|1 E3 |2 F3 |3");

      expect(result).toStrictEqual([
        createNote(), // bar 1, beat 1
        createNote({ pitch: 62, start_time: 4 }), // bar 2, beat 1
        createNote({ pitch: 64, start_time: 5 }), // bar 2, beat 2
        createNote({ pitch: 65, start_time: 6 }), // bar 2, beat 3
      ]);
    });

    it("mixes full bar|beat and |beat notation", () => {
      const result = interpretNotation(
        "C3 1|1 D3 |2 E3 3|1 F3 |4 G3 2|3 A3 |4",
      );

      expect(result).toStrictEqual([
        createNote(), // bar 1, beat 1
        createNote({ pitch: 62, start_time: 1 }), // bar 1, beat 2
        createNote({ pitch: 64, start_time: 8 }), // bar 3, beat 1
        createNote({ pitch: 65, start_time: 11 }), // bar 3, beat 4
        createNote({ pitch: 67, start_time: 6 }), // bar 2, beat 3
        createNote({ pitch: 69, start_time: 7 }), // bar 2, beat 4
      ]);
    });

    it("handles |beat with sub-beat timing", () => {
      const result = interpretNotation("C3 1|1.5 D3 |2.25 E3 |3.75");

      expect(result).toStrictEqual([
        createNote({ start_time: 0.5 }), // bar 1, beat 1.5
        createNote({ pitch: 62, start_time: 1.25 }), // bar 1, beat 2.25
        createNote({ pitch: 64, start_time: 2.75 }), // bar 1, beat 3.75
      ]);
    });

    it("preserves state across |beat shortcuts", () => {
      const result = interpretNotation("v80 t0.5 p0.8 C3 1|1 D3 |2 v100 E3 |3");

      expect(result).toStrictEqual([
        createNote({ duration: 0.5, velocity: 80, probability: 0.8 }), // bar 1, beat 1
        createNote({
          pitch: 62,
          start_time: 1,
          duration: 0.5,
          velocity: 80,
          probability: 0.8,
        }), // bar 1, beat 2
        createNote({
          pitch: 64,
          start_time: 2,
          duration: 0.5,
          probability: 0.8,
        }), // bar 1, beat 3 (velocity changed but duration and probability preserved)
      ]);
    });

    it("works with different time signatures", () => {
      const result = interpretNotation("C3 1|1 D3 |2 E3 |3", {
        timeSigNumerator: 3,
        timeSigDenominator: 4,
      });

      expect(result).toStrictEqual([
        createNote(), // bar 1, beat 1
        createNote({ pitch: 62, start_time: 1 }), // bar 1, beat 2
        createNote({ pitch: 64, start_time: 2 }), // bar 1, beat 3
      ]);
    });

    it("assumes bar 1 when |beat is used at start without initial bar", () => {
      const result = interpretNotation("C3 |2");

      expect(result).toStrictEqual([createNote({ start_time: 1 })]); // bar 1, beat 2 (assumed)
    });

    it("assumes bar 1 when |beat is used without any prior bar number", () => {
      const result = interpretNotation("v100 t0.5 C3 |2");

      expect(result).toStrictEqual([
        createNote({ start_time: 1, duration: 0.5 }),
      ]); // bar 1, beat 2 (assumed)
    });

    it("assumes bar 1 when |beat is used after state changes but before any bar number", () => {
      const result = interpretNotation("v100 C3 |1");

      expect(result).toStrictEqual([createNote()]); // bar 1, beat 1 (assumed)
    });
  });
});
