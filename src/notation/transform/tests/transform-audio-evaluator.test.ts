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
      const result = applyAudioTransform(0, "gain = -6");

      expect(result).toBe(-6);
    });

    it("applies gain add transform", () => {
      const result = applyAudioTransform(0, "gain += 3");

      expect(result).toBe(3);
    });

    it("applies gain add to existing value", () => {
      const result = applyAudioTransform(-6, "gain += 3");

      expect(result).toBe(-3);
    });

    it("applies multiple gain transforms sequentially", () => {
      const result = applyAudioTransform(0, "gain = -6\ngain += 3");

      expect(result).toBe(-3);
    });
  });

  describe("clamping", () => {
    it("clamps gain to minimum (-70 dB)", () => {
      const result = applyAudioTransform(0, "gain = -100");

      expect(result).toBe(-70);
    });

    it("clamps gain to maximum (24 dB)", () => {
      const result = applyAudioTransform(0, "gain = 50");

      expect(result).toBe(24);
    });

    it("clamps gain add result to minimum", () => {
      const result = applyAudioTransform(-60, "gain += -20");

      expect(result).toBe(-70);
    });

    it("clamps gain add result to maximum", () => {
      const result = applyAudioTransform(20, "gain += 10");

      expect(result).toBe(24);
    });
  });

  describe("audio.gain variable", () => {
    it("resolves audio.gain variable", () => {
      const result = applyAudioTransform(-6, "gain = audio.gain + 3");

      expect(result).toBe(-3);
    });

    it("resolves audio.gain in self-reference", () => {
      const result = applyAudioTransform(-12, "gain = audio.gain - 6");

      expect(result).toBe(-18);
    });

    it("updates audio.gain for subsequent transforms", () => {
      const result = applyAudioTransform(0, "gain = -6\ngain = audio.gain * 2");

      expect(result).toBe(-12);
    });
  });

  describe("expressions", () => {
    it("evaluates arithmetic expressions", () => {
      const result = applyAudioTransform(0, "gain = -12 + 6");

      expect(result).toBe(-6);
    });

    it("evaluates multiplication", () => {
      const result = applyAudioTransform(-6, "gain = audio.gain * 2");

      expect(result).toBe(-12);
    });

    it("evaluates division", () => {
      const result = applyAudioTransform(-12, "gain = audio.gain / 2");

      expect(result).toBe(-6);
    });

    it("handles division by zero", () => {
      const result = applyAudioTransform(-6, "gain = audio.gain / 0");

      expect(result).toBe(0);
    });

    it("evaluates complex expressions", () => {
      const result = applyAudioTransform(0, "gain = -12 + 6 * 2");

      expect(result).toBe(0);
    });
  });

  describe("waveform functions", () => {
    it("evaluates cos function", () => {
      // cos at position 0 with any period returns 1.0
      const result = applyAudioTransform(0, "gain = -12 + 6 * cos(4t)");

      // cos(0) = 1.0, so -12 + 6 * 1 = -6
      expect(result).toBe(-6);
    });

    it("evaluates noise function (returns value in range)", () => {
      const result = applyAudioTransform(0, "gain = 6 * noise()");

      // noise returns [-1, 1], so result is [-6, 6]
      expect(result).toBeGreaterThanOrEqual(-6);
      expect(result).toBeLessThanOrEqual(6);
    });

    it("evaluates function with expression argument", () => {
      // This tests the recursive evaluation callback in evaluateAudioExpressionWithContext
      const result = applyAudioTransform(0, "gain = 6 * cos(2 + 2)");

      // cos at position 0 with period 4 returns 1.0
      // 6 * 1.0 = 6
      expect(result).toBe(6);
    });

    it("evaluates ramp function", () => {
      // ramp(start, end) at position 0 with clip range 0-4 returns start value
      const result = applyAudioTransform(0, "gain = ramp(-12, 0)");

      // At position 0, ramp returns the start value
      expect(result).toBe(-12);
    });
  });

  describe("null returns", () => {
    it("returns null for empty transform string", () => {
      const result = applyAudioTransform(0, "");

      expect(result).toBeNull();
    });

    it("returns null for undefined transform string", () => {
      const result = applyAudioTransform(0, undefined);

      expect(result).toBeNull();
    });

    it("returns null when no gain transforms present", () => {
      const result = applyAudioTransform(0, "velocity += 10");

      expect(result).toBeNull();
    });

    it("returns null for whitespace-only input", () => {
      const result = applyAudioTransform(0, "   ");

      expect(result).toBeNull();
    });
  });

  describe("MIDI parameter handling", () => {
    it("ignores MIDI parameters and applies only gain", () => {
      const result = applyAudioTransform(0, "gain = -6\nvelocity += 10");

      expect(result).toBe(-6);
    });

    it("returns null when only MIDI parameters present", () => {
      const result = applyAudioTransform(0, "velocity += 10\nduration = 2");

      expect(result).toBeNull();
    });
  });

  describe("error handling", () => {
    it("returns null for invalid syntax", () => {
      const result = applyAudioTransform(0, "gain = =");

      expect(result).toBeNull();
    });

    it("handles note variable in audio context gracefully", () => {
      // This should fail during evaluation but not crash
      const result = applyAudioTransform(0, "gain = note.velocity");

      // Returns initial value clamped since evaluation fails
      expect(result).toBe(0);
    });
  });
});
