// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, type vi } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";

describe("bar|beat interpretNotation() - timing features", () => {
  describe("time-position-driven note emission", () => {
    it("emits pitch at single time position", () => {
      const result = interpretNotation("C1 1|1");

      expect(result).toStrictEqual([createNote({ pitch: 36 })]);
    });

    it("emits same pitch at multiple times (pitch persistence)", () => {
      const result = interpretNotation("C1 1|1 1|2 1|3 1|4");

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
      const result = interpretNotation("v100 C4 1|1 v90 1|2");

      expect(result).toHaveLength(2);
      expect(result[0]!.pitch).toBe(72); // C4
      expect(result[0]!.velocity).toBe(100);
      expect(result[0]!.start_time).toBe(0);
      expect(result[1]!.pitch).toBe(72); // C4
      expect(result[1]!.velocity).toBe(90);
      expect(result[1]!.start_time).toBe(1);
    });

    it("handles complex state updates with multiple pitches", () => {
      const result = interpretNotation("v80 C4 v90 G4 1|1 v100 1|2");

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
      const result = interpretNotation("C4 1|1 t0.5 1|2 t0.25 1|3");

      expect(result).toHaveLength(3);
      expect(result[0]!.duration).toBe(1);
      expect(result[1]!.duration).toBe(0.5);
      expect(result[2]!.duration).toBe(0.25);
    });

    it("handles probability updates after time", () => {
      const result = interpretNotation("C4 1|1 p0.8 1|2 p0.5 1|3");

      expect(result).toHaveLength(3);
      expect(result[0]!.probability).toBe(1.0);
      expect(result[1]!.probability).toBe(0.8);
      expect(result[2]!.probability).toBe(0.5);
    });

    it("handles velocity range updates after time", () => {
      const result = interpretNotation("C4 1|1 v80-100 1|2");

      expect(result).toHaveLength(2);
      expect(result[0]!.velocity).toBe(100);
      expect(result[0]!.velocity_deviation).toBe(0);
      expect(result[1]!.velocity).toBe(80);
      expect(result[1]!.velocity_deviation).toBe(20);
    });

    it("supports drum patterns", () => {
      const result = interpretNotation("C1 1|1 1|2 1|3 1|4");

      expect(result).toHaveLength(4);
      expect(result.every((n) => n.pitch === 36)).toBe(true);
      expect(result.map((n) => n.start_time)).toStrictEqual([0, 1, 2, 3]);
    });

    it("supports layered drum patterns", () => {
      const result = interpretNotation("C1 1|1 1|3  D1 1|2 1|4");

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
      interpretNotation("C3 E3 G3");
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("3 pitch(es) buffered but no time position"),
      );
    });

    it("warns when time position has no pitches", () => {
      interpretNotation("1|1");
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Time position 1|1 has no pitches"),
      );
    });

    it("warns when state changes after pitch but before time", () => {
      interpretNotation("C4 v100 1|1");
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          "state change after pitch(es) but before time position won't affect this group",
        ),
      );
    });

    it("does not warn when state changes after pitch but before another pitch", () => {
      const result = interpretNotation("v80 C4 v90 G4 1|1");

      expect(result).toHaveLength(2);
      // Should only warn about "state change won't affect group", not about it happening
      const warningCalls = (outlet as ReturnType<typeof vi.fn>).mock.calls
        .filter((call) => call[0] === 1)
        .filter((call) => !call[1].includes("buffered but no time position"));

      expect(warningCalls).toHaveLength(0);
    });

    it("does not warn when state changes after time", () => {
      const result = interpretNotation("C4 1|1 v90 1|2");

      expect(result).toHaveLength(2);
      // Should only warn about "state change won't affect group", not about it happening
      const warningCalls = (outlet as ReturnType<typeof vi.fn>).mock.calls
        .filter((call) => call[0] === 1)
        .filter((call) => !call[1].includes("buffered but no time position"));

      expect(warningCalls).toHaveLength(0);
    });
  });
});
