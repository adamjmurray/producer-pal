// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { applyAudioTransform } from "../transform-audio-evaluator.ts";

// Mock console.warn to capture warnings
vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
}));

describe("Audio Transform Evaluator", () => {
  describe("gain parameter", () => {
    it("applies gain set transform", () => {
      const result = applyAudioTransform(0, 0, "gain = -6");

      expect(result.gain).toBe(-6);
      expect(result.pitchShift).toBeNull();
    });

    it("applies gain add transform", () => {
      const result = applyAudioTransform(0, 0, "gain += 3");

      expect(result.gain).toBe(3);
    });

    it("applies gain add to existing value", () => {
      const result = applyAudioTransform(-6, 0, "gain += 3");

      expect(result.gain).toBe(-3);
    });

    it("applies multiple gain transforms sequentially", () => {
      const result = applyAudioTransform(0, 0, "gain = -6\ngain += 3");

      expect(result.gain).toBe(-3);
    });
  });

  describe("gain clamping", () => {
    it("clamps gain to minimum (-70 dB)", () => {
      const result = applyAudioTransform(0, 0, "gain = -100");

      expect(result.gain).toBe(-70);
    });

    it("clamps gain to maximum (24 dB)", () => {
      const result = applyAudioTransform(0, 0, "gain = 50");

      expect(result.gain).toBe(24);
    });

    it("clamps gain add result to minimum", () => {
      const result = applyAudioTransform(-60, 0, "gain += -20");

      expect(result.gain).toBe(-70);
    });

    it("clamps gain add result to maximum", () => {
      const result = applyAudioTransform(20, 0, "gain += 10");

      expect(result.gain).toBe(24);
    });
  });

  describe("audio.gain variable", () => {
    it("resolves audio.gain variable", () => {
      const result = applyAudioTransform(-6, 0, "gain = audio.gain + 3");

      expect(result.gain).toBe(-3);
    });

    it("resolves audio.gain in self-reference", () => {
      const result = applyAudioTransform(-12, 0, "gain = audio.gain - 6");

      expect(result.gain).toBe(-18);
    });

    it("updates audio.gain for subsequent transforms", () => {
      const result = applyAudioTransform(
        0,
        0,
        "gain = -6\ngain = audio.gain * 2",
      );

      expect(result.gain).toBe(-12);
    });
  });

  describe("pitchShift parameter", () => {
    it("applies pitchShift set transform", () => {
      const result = applyAudioTransform(0, 0, "pitchShift = 5");

      expect(result.pitchShift).toBe(5);
      expect(result.gain).toBeNull();
    });

    it("applies pitchShift add transform", () => {
      const result = applyAudioTransform(0, 3, "pitchShift += 2");

      expect(result.pitchShift).toBe(5);
    });

    it("applies pitchShift with decimal values", () => {
      const result = applyAudioTransform(0, 0, "pitchShift = 5.5");

      expect(result.pitchShift).toBe(5.5);
    });

    it("applies negative pitchShift", () => {
      const result = applyAudioTransform(0, 0, "pitchShift = -12");

      expect(result.pitchShift).toBe(-12);
    });

    it("applies multiple pitchShift transforms sequentially", () => {
      const result = applyAudioTransform(
        0,
        0,
        "pitchShift = 5\npitchShift += 2",
      );

      expect(result.pitchShift).toBe(7);
    });
  });

  describe("pitchShift clamping", () => {
    it("clamps pitchShift to minimum (-48)", () => {
      const result = applyAudioTransform(0, 0, "pitchShift = -60");

      expect(result.pitchShift).toBe(-48);
    });

    it("clamps pitchShift to maximum (48)", () => {
      const result = applyAudioTransform(0, 0, "pitchShift = 60");

      expect(result.pitchShift).toBe(48);
    });
  });

  describe("audio.pitchShift variable", () => {
    it("resolves audio.pitchShift variable", () => {
      const result = applyAudioTransform(
        0,
        5,
        "pitchShift = audio.pitchShift + 2",
      );

      expect(result.pitchShift).toBe(7);
    });

    it("updates audio.pitchShift for subsequent transforms", () => {
      const result = applyAudioTransform(
        0,
        0,
        "pitchShift = 5\npitchShift = audio.pitchShift * 2",
      );

      expect(result.pitchShift).toBe(10);
    });
  });

  describe("combined gain and pitchShift", () => {
    it("applies both gain and pitchShift in same transform", () => {
      const result = applyAudioTransform(0, 0, "gain = -6\npitchShift = 5");

      expect(result.gain).toBe(-6);
      expect(result.pitchShift).toBe(5);
    });

    it("can reference both properties in expressions", () => {
      const result = applyAudioTransform(
        -6,
        5,
        "gain = audio.gain + audio.pitchShift",
      );

      expect(result.gain).toBe(-1);
      expect(result.pitchShift).toBeNull();
    });
  });

  describe("expressions", () => {
    it("evaluates arithmetic expressions", () => {
      const result = applyAudioTransform(0, 0, "gain = -12 + 6");

      expect(result.gain).toBe(-6);
    });

    it("evaluates multiplication", () => {
      const result = applyAudioTransform(-6, 0, "gain = audio.gain * 2");

      expect(result.gain).toBe(-12);
    });

    it("evaluates division", () => {
      const result = applyAudioTransform(-12, 0, "gain = audio.gain / 2");

      expect(result.gain).toBe(-6);
    });

    it("handles division by zero", () => {
      const result = applyAudioTransform(-6, 0, "gain = audio.gain / 0");

      expect(result.gain).toBe(0);
    });

    it("evaluates complex expressions", () => {
      const result = applyAudioTransform(0, 0, "gain = -12 + 6 * 2");

      expect(result.gain).toBe(0);
    });
  });

  describe("waveform functions", () => {
    it("evaluates cos function", () => {
      // cos at position 0 with any period returns 1.0
      const result = applyAudioTransform(0, 0, "gain = -12 + 6 * cos(4t)");

      // cos(0) = 1.0, so -12 + 6 * 1 = -6
      expect(result.gain).toBe(-6);
    });

    it("evaluates rand function (returns value in range)", () => {
      const result = applyAudioTransform(0, 0, "gain = 6 * rand()");

      // rand() returns [-1, 1], so result is [-6, 6]
      expect(result.gain).toBeGreaterThanOrEqual(-6);
      expect(result.gain).toBeLessThanOrEqual(6);
    });

    it("evaluates function with expression argument", () => {
      // This tests the recursive evaluation callback in evaluateAudioExpressionWithContext
      const result = applyAudioTransform(0, 0, "gain = 6 * cos(2 + 2)");

      // cos at position 0 with period 4 returns 1.0
      // 6 * 1.0 = 6
      expect(result.gain).toBe(6);
    });

    it("evaluates ramp function", () => {
      // ramp(start, end) at position 0 with clip range 0-4 returns start value
      const result = applyAudioTransform(0, 0, "gain = ramp(-12, 0)");

      // At position 0, ramp returns the start value
      expect(result.gain).toBe(-12);
    });
  });

  describe("null returns", () => {
    it("returns nulls for empty transform string", () => {
      const result = applyAudioTransform(0, 0, "");

      expect(result.gain).toBeNull();
      expect(result.pitchShift).toBeNull();
    });

    it("returns nulls for undefined transform string", () => {
      const result = applyAudioTransform(0, 0, undefined);

      expect(result.gain).toBeNull();
      expect(result.pitchShift).toBeNull();
    });

    it("returns nulls when no audio transforms present", () => {
      const result = applyAudioTransform(0, 0, "velocity += 10");

      expect(result.gain).toBeNull();
      expect(result.pitchShift).toBeNull();
    });

    it("returns nulls for whitespace-only input", () => {
      const result = applyAudioTransform(0, 0, "   ");

      expect(result.gain).toBeNull();
      expect(result.pitchShift).toBeNull();
    });
  });

  describe("MIDI parameter handling", () => {
    it("ignores MIDI parameters and applies only audio params", () => {
      const result = applyAudioTransform(0, 0, "gain = -6\nvelocity += 10");

      expect(result.gain).toBe(-6);
    });

    it("returns nulls when only MIDI parameters present", () => {
      const result = applyAudioTransform(0, 0, "velocity += 10\nduration = 2");

      expect(result.gain).toBeNull();
      expect(result.pitchShift).toBeNull();
    });
  });

  describe("error handling", () => {
    it("returns nulls for invalid syntax", () => {
      const result = applyAudioTransform(0, 0, "gain = =");

      expect(result.gain).toBeNull();
      expect(result.pitchShift).toBeNull();
    });

    it("handles note variable in audio context gracefully", () => {
      // This should fail during evaluation but not crash
      const result = applyAudioTransform(0, 0, "gain = note.velocity");

      // Returns null since evaluation fails (no successful transforms applied)
      expect(result.gain).toBeNull();
    });
  });
});
