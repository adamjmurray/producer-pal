// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { scaleIntervalsToPitchClassMask } from "#src/shared/pitch.ts";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";

const CTX = { position: 0, timeSig: { numerator: 4, denominator: 4 } };

// C Major: C D E F G A B → pitch classes 0,2,4,5,7,9,11
const C_MAJOR_MASK = scaleIntervalsToPitchClassMask([0, 2, 4, 5, 7, 9, 11], 0);

describe("Transform Evaluator - quant()", () => {
  describe("basic quantization with C Major scale", () => {
    it("returns in-scale pitch unchanged", () => {
      const result = evaluateTransform("pitch = quant(60)", CTX, {
        "scale:mask": C_MAJOR_MASK,
      });

      expect(result.pitch!.value).toBe(60); // C3
    });

    it("quantizes out-of-scale pitch to nearest in-scale", () => {
      const result = evaluateTransform("pitch = quant(61)", CTX, {
        "scale:mask": C_MAJOR_MASK,
      });

      // C# (61) equidistant from C (60) and D (62) → prefer higher → 62
      expect(result.pitch!.value).toBe(62);
    });

    it("prefers higher pitch when equidistant", () => {
      const result = evaluateTransform("pitch = quant(63)", CTX, {
        "scale:mask": C_MAJOR_MASK,
      });

      // Eb (63) equidistant from D (62) and E (64) → prefer higher → 64
      expect(result.pitch!.value).toBe(64);
    });
  });

  describe("no-op cases", () => {
    it("returns input unchanged when no scale:mask", () => {
      const result = evaluateTransform("pitch = quant(61)", CTX);

      expect(result.pitch!.value).toBe(61);
    });

    it("returns input unchanged when no scale:mask (explicit props)", () => {
      const result = evaluateTransform("pitch = quant(61)", CTX, {
        pitch: 60,
      });

      expect(result.pitch!.value).toBe(61);
    });
  });

  describe("with expressions", () => {
    it("quantizes expression result", () => {
      const result = evaluateTransform("pitch = quant(note.pitch + 1)", CTX, {
        pitch: 60,
        "scale:mask": C_MAJOR_MASK,
      });

      // 60 + 1 = 61 (C#) → quantizes to 62 (D)
      expect(result.pitch!.value).toBe(62);
    });

    it("works with += operator", () => {
      const result = evaluateTransform(
        "pitch += quant(note.pitch + 7) - note.pitch",
        CTX,
        { pitch: 60, "scale:mask": C_MAJOR_MASK },
      );

      // note.pitch + 7 = 67 (G, in scale) → quant returns 67
      // 67 - 60 = 7
      expect(result.pitch!.value).toBe(7);
    });
  });

  describe("boundary clamping", () => {
    it("clamps high values to nearest in-scale pitch <= 127", () => {
      const result = evaluateTransform("pitch = quant(130)", CTX, {
        "scale:mask": C_MAJOR_MASK,
      });

      // 130 → nearest in-scale <= 127 is G8 (127)
      expect(result.pitch!.value).toBe(127);
    });

    it("clamps low values to nearest in-scale pitch >= 0", () => {
      const result = evaluateTransform("pitch = quant(-3)", CTX, {
        "scale:mask": C_MAJOR_MASK,
      });

      // -3 → nearest in-scale >= 0 is C (0)
      expect(result.pitch!.value).toBe(0);
    });
  });

  describe("error handling", () => {
    it("throws for zero arguments", () => {
      const result = evaluateTransform("pitch = quant()", CTX, {
        "scale:mask": C_MAJOR_MASK,
      });

      // Should fail to evaluate, returning empty result
      expect(result.pitch).toBeUndefined();
    });

    it("throws for two arguments", () => {
      const result = evaluateTransform("pitch = quant(60, 62)", CTX, {
        "scale:mask": C_MAJOR_MASK,
      });

      expect(result.pitch).toBeUndefined();
    });
  });

  describe("different scales", () => {
    it("works with D Minor scale", () => {
      // D Minor: D E F G A Bb C → intervals 0,2,3,5,7,8,10 from root D (2)
      const dMinorMask = scaleIntervalsToPitchClassMask(
        [0, 2, 3, 5, 7, 8, 10],
        2,
      );

      // F# (66) is between F (65) and G (67) — equidistant, prefer higher
      const result = evaluateTransform("pitch = quant(66)", CTX, {
        "scale:mask": dMinorMask,
      });

      expect(result.pitch!.value).toBe(67); // G
    });

    it("works with pentatonic scale", () => {
      // C Minor Pentatonic: C Eb F G Bb → intervals 0,3,5,7,10
      const mask = scaleIntervalsToPitchClassMask([0, 3, 5, 7, 10], 0);

      // D (62) is between C (60) and Eb (63) → closer to Eb
      const result = evaluateTransform("pitch = quant(62)", CTX, {
        "scale:mask": mask,
      });

      expect(result.pitch!.value).toBe(63);
    });
  });
});
