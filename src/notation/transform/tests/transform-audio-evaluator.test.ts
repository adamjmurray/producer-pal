// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.ts";
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
      const result = applyAudioTransform(0, 0, "gain = -12 + 6 * cos(n/1)");

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

  describe("timeRange selector handling", () => {
    beforeEach(() => {
      vi.mocked(console.warn).mockClear();
    });

    it("warns when a timeRange selector is used on an audio transform", () => {
      const result = applyAudioTransform(0, 0, "1|1-2|1: gain += 3");

      // Still applies to the whole clip
      expect(result.gain).toBe(3);
      expect(console.warn).toHaveBeenCalledWith(
        "timeRange selector ignored for audio clip transform (audio transforms apply to the whole clip)",
      );
    });

    it("does not warn when no timeRange selector is present", () => {
      applyAudioTransform(0, 0, "gain += 3");

      expect(console.warn).not.toHaveBeenCalledWith(
        "timeRange selector ignored for audio clip transform (audio transforms apply to the whole clip)",
      );
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

  describe("clip and bar context variables", () => {
    it("resolves clip.duration with clipContext", () => {
      const result = applyAudioTransform(0, 0, "gain = clip.duration", {
        clipDuration: 16,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 4,
      });

      expect(result.gain).toBe(16);
    });

    it("resolves clip.index with clipContext", () => {
      const result = applyAudioTransform(0, 0, "gain = clip.index * -3", {
        clipDuration: 8,
        clipIndex: 2,
        clipCount: 3,
        barDuration: 4,
      });

      expect(result.gain).toBe(-6);
    });

    it("resolves clip.count with clipContext", () => {
      const result = applyAudioTransform(0, 0, "gain = clip.count * -3", {
        clipDuration: 8,
        clipIndex: 0,
        clipCount: 4,
        barDuration: 4,
      });

      expect(result.gain).toBe(-12);
    });

    it("resolves clip.position for arrangement clips", () => {
      const result = applyAudioTransform(0, 0, "gain = clip.position / 4", {
        clipDuration: 16,
        clipIndex: 0,
        clipCount: 1,
        arrangementStart: 32,
        barDuration: 4,
      });

      expect(result.gain).toBe(8);
    });

    it("resolves clip.position to 0 with a warning on a session clip", () => {
      vi.mocked(console.warn).mockClear();
      const result = applyAudioTransform(-6, 0, "gain = clip.position", {
        clipDuration: 16,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 4,
      });

      // Session clips have no arrangement origin: clip.position resolves to 0
      // (neutral) + warn instead of failing the transform.
      expect(result.gain).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        "clip.position is not available for session clips; using 0",
      );
    });

    it("resolves clip.barDuration with clipContext", () => {
      const result = applyAudioTransform(0, 0, "gain = clip.barDuration", {
        clipDuration: 24,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 6,
      });

      expect(result.gain).toBe(6);
    });

    it("errors when clip variable used without clipContext", () => {
      const result = applyAudioTransform(0, 0, "gain = clip.duration");

      expect(result.gain).toBeNull();
    });

    it("errors when clip.barDuration used without clipContext", () => {
      const result = applyAudioTransform(0, 0, "gain = clip.barDuration");

      expect(result.gain).toBeNull();
    });

    it("uses clip context in binary expressions", () => {
      const result = applyAudioTransform(
        -24,
        0,
        "gain = audio.gain + clip.index * 6",
        {
          clipDuration: 8,
          clipIndex: 3,
          clipCount: 4,
          barDuration: 4,
        },
      );

      // -24 + 3 * 6 = -6
      expect(result.gain).toBe(-6);
    });

    it("resolves Nbar using the clip's beats-per-bar", () => {
      const result = applyAudioTransform(0, 0, "gain = 1bar", {
        clipDuration: 24,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 6,
      });

      // 1bar = 1 * 6 musical beats in 6/8
      expect(result.gain).toBe(6);
    });

    it("resolves Nbar to a 4/4 bar when no clipContext is provided", () => {
      const result = applyAudioTransform(0, 0, "gain = 1bar");

      // Falls back to 4 beats per bar (same assumption as the nDuration path)
      expect(result.gain).toBe(4);
    });
  });

  describe("synced waveform meter frame", () => {
    // Synced waveform periods authored as n<frac> must resolve in the clip's
    // real meter so they share clip.barDuration/clip.position's musical-beats
    // frame. A one-bar period is `n6/8` in 6/8 and `n2/2` in 2/2 — both must
    // equal clip.barDuration. (Regression: these resolved in a hardcoded denom-4
    // frame, so the synced LFO cycled at rate x denominator/4 in any non-x/4
    // meter; every prior audio test ran at position 0 where it coincides.)
    it("6/8: n6/8 sync period equals clip.barDuration", () => {
      const ctx = {
        clipDuration: 12,
        clipIndex: 0,
        clipCount: 1,
        arrangementStart: 1.5, // musical beats; phase 1.5/6 = 0.25 -> sin = 1
        barDuration: 6,
        timeSigDenominator: 8,
      };
      const viaBar = applyAudioTransform(
        0,
        0,
        "gain = sin(clip.barDuration, sync)",
        ctx,
      );
      const viaN = applyAudioTransform(0, 0, "gain = sin(n6/8, sync)", ctx);

      expect(viaN.gain).toBeCloseTo(viaBar.gain as number, 9);
      expect(viaN.gain).toBeCloseTo(1, 9);
    });

    it("2/2: n2/2 sync period equals clip.barDuration", () => {
      const ctx = {
        clipDuration: 8,
        clipIndex: 0,
        clipCount: 1,
        arrangementStart: 0.5, // musical beats; phase 0.5/2 = 0.25 -> sin = 1
        barDuration: 2,
        timeSigDenominator: 2,
      };
      const viaBar = applyAudioTransform(
        0,
        0,
        "gain = sin(clip.barDuration, sync)",
        ctx,
      );
      const viaN = applyAudioTransform(0, 0, "gain = sin(n2/2, sync)", ctx);

      expect(viaN.gain).toBeCloseTo(viaBar.gain as number, 9);
      expect(viaN.gain).toBeCloseTo(1, 9);
    });

    it("4/4 control: n/1 sync period equals clip.barDuration at a non-zero origin", () => {
      const ctx = {
        clipDuration: 8,
        clipIndex: 0,
        clipCount: 1,
        arrangementStart: 1, // phase 1/4 = 0.25 -> sin = 1
        barDuration: 4,
        timeSigDenominator: 4,
      };
      const viaBar = applyAudioTransform(
        0,
        0,
        "gain = sin(clip.barDuration, sync)",
        ctx,
      );
      const viaN = applyAudioTransform(0, 0, "gain = sin(n/1, sync)", ctx);

      expect(viaN.gain).toBeCloseTo(viaBar.gain as number, 9);
      expect(viaN.gain).toBeCloseTo(1, 9);
    });
  });

  describe("synced waveform on session clips", () => {
    it("degrades synced waveform to clip-relative with a warning", () => {
      vi.mocked(console.warn).mockClear();
      const ctx = {
        clipDuration: 4,
        clipIndex: 0,
        clipCount: 1,
        arrangementStart: undefined, // session clip: no arrangement origin
        barDuration: 4,
        timeSigDenominator: 4,
      };
      // Audio always evaluates at position 0, so offset the phase by 0.25 to get
      // a non-trivial value (sin(0.25 cycle) = 1). This distinguishes "applied"
      // (degraded to clip-relative) from the old "skipped" behavior.
      const synced = applyAudioTransform(
        0,
        0,
        "gain = sin(n/1, 0.25, sync)",
        ctx,
      );
      const unsynced = applyAudioTransform(0, 0, "gain = sin(n/1, 0.25)", ctx);

      expect(synced.gain).toBeCloseTo(1, 9);
      expect(synced.gain).toBeCloseTo(unsynced.gain as number, 9);
      expect(console.warn).toHaveBeenCalledWith(
        "sync ignored on session clip — LFO is clip-relative",
      );
    });
  });

  describe("clipseq function (audio)", () => {
    it("selects value based on clip.index", () => {
      const result0 = applyAudioTransform(0, 0, "gain = clipseq(-3, -6, -9)", {
        clipDuration: 8,
        clipIndex: 0,
        clipCount: 3,
        barDuration: 4,
      });

      expect(result0.gain).toBe(-3);

      const result1 = applyAudioTransform(0, 0, "gain = clipseq(-3, -6, -9)", {
        clipDuration: 8,
        clipIndex: 1,
        clipCount: 3,
        barDuration: 4,
      });

      expect(result1.gain).toBe(-6);

      const result2 = applyAudioTransform(0, 0, "gain = clipseq(-3, -6, -9)", {
        clipDuration: 8,
        clipIndex: 2,
        clipCount: 3,
        barDuration: 4,
      });

      expect(result2.gain).toBe(-9);
    });

    it("wraps around when clip.index exceeds args count", () => {
      const result = applyAudioTransform(0, 0, "gain = clipseq(-3, -6)", {
        clipDuration: 8,
        clipIndex: 3,
        clipCount: 4,
        barDuration: 4,
      });

      // 3 % 2 = 1 → -6
      expect(result.gain).toBe(-6);
    });
  });

  describe("seq function (audio) — clip-axis fallback", () => {
    beforeEach(() => {
      vi.mocked(console.warn).mockClear();
    });

    it("cycles by clip.index (gain has no note axis), like clipseq()", () => {
      const result = applyAudioTransform(0, 0, "gain = seq(-3, -6, -9)", {
        clipDuration: 8,
        clipIndex: 2,
        clipCount: 3,
        barDuration: 4,
      });

      // gain/pitchShift are clip-granular — note.index can't exist, so the clip
      // axis is the only meaning. seq() falls back to clip:index here (== the
      // clipseq() result) instead of warning.
      expect(result.gain).toBe(-9);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("pitch literal as a value (#4)", () => {
    it("warns and skips a bare pitch literal assigned to gain (no silent coerce)", () => {
      // `gain = C3` is nonsensical — audio clips have no pitch. It must not
      // silently coerce to a MIDI number (C3 → 60, clamped to the 24 dB max);
      // warn clearly and leave gain unchanged. (Previously it threw a cryptic
      // internal error; the first fix made it silently write the clamped MIDI
      // number — this asserts warn-and-skip instead.)
      const result = applyAudioTransform(0, 0, "gain = C3");

      expect(result.gain).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'pitch name "C3" isn\'t a valid value for gain',
        ),
      );
    });

    it("warns and skips a bare pitch literal assigned to pitchShift", () => {
      const result = applyAudioTransform(0, 0, "pitchShift = C3");

      expect(result.pitchShift).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'pitch name "C3" isn\'t a valid value for pitchShift',
        ),
      );
    });

    it("still resolves a pitch literal nested in arithmetic to its MIDI number", () => {
      // Only a BARE top-level pitch literal is rejected. Nested in an expression
      // (here `C3 + 0`) it resolves to its MIDI number (60), clamped to the gain
      // max (24) — mirroring the note evaluator, and avoiding a cryptic throw.
      const result = applyAudioTransform(0, 0, "gain = C3 + 0");

      expect(result.gain).toBe(24);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
