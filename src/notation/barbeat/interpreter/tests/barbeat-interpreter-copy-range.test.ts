// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";

describe("bar|beat interpretNotation() - bar copy range operations", () => {
  describe("range copy", () => {
    it("copies bar to range with @N-M= syntax (default source)", () => {
      const result = interpretNotation("C3 D3 1|1 @2-4=");

      expect(result).toStrictEqual([
        createNote(),
        createNote({ pitch: 62 }),
        createNote({ start_time: 4 }),
        createNote({ pitch: 62, start_time: 4 }),
        createNote({ start_time: 8 }),
        createNote({ pitch: 62, start_time: 8 }),
        createNote({ start_time: 12 }),
        createNote({ pitch: 62, start_time: 12 }),
      ]);
    });
    it("copies bar to range with @N-M=P syntax (explicit source)", () => {
      const result = interpretNotation("C3 1|1 D3 2|1 @4-6=1");

      expect(result).toStrictEqual([
        createNote(),
        createNote({ pitch: 62, start_time: 4 }),
        createNote({ start_time: 12 }),
        createNote({ start_time: 16 }),
        createNote({ start_time: 20 }),
      ]);
    });
    it("preserves note properties in range copy", () => {
      const result = interpretNotation("v80 t0.5 p0.8 C3 1|1 @2-3=");

      expect(result).toStrictEqual([
        createNote({ duration: 0.5, velocity: 80, probability: 0.8 }),
        createNote({
          start_time: 4,
          duration: 0.5,
          velocity: 80,
          probability: 0.8,
        }),
        createNote({
          start_time: 8,
          duration: 0.5,
          velocity: 80,
          probability: 0.8,
        }),
      ]);
    });
    it("handles range copy with different time signatures", () => {
      const result = interpretNotation("C3 1|1 @2-3=", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });

      expect(result).toStrictEqual([
        createNote({ duration: 0.5 }),
        createNote({ start_time: 3.0, duration: 0.5 }),
        createNote({ start_time: 6.0, duration: 0.5 }),
      ]);
    });
    it("can chain range copies with regular copies", () => {
      const result = interpretNotation("C3 1|1 @2-3= @5=1");

      expect(result).toHaveLength(4);
      expect(result).toContainEqual(createNote());
      expect(result).toContainEqual(createNote({ start_time: 4 }));
      expect(result).toContainEqual(createNote({ start_time: 8 }));
      expect(result).toContainEqual(createNote({ start_time: 16 }));
    });
  });
});
