// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import {
  type ClipTransformInputs,
  resolveClipTransform,
} from "../helpers/create-clip-transform-helpers.ts";

// Mock applyTransforms so we can (a) detect whether the guard let the transform
// run and (b) capture the ClipContext the helper builds (clipDuration /
// arrangementStart), which is otherwise internal to buildCreateClipContext.
vi.mock(
  import("#src/notation/transform/transform-evaluator.ts"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    applyTransforms: vi.fn(() => 3),
  }),
);

import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";

/**
 * Build ClipTransformInputs whose guard operands are all "transform runs"
 * (transform present, MIDI, non-empty notes) unless overridden.
 * @param overrides - Fields to override on the default inputs
 * @returns Complete ClipTransformInputs for resolveClipTransform
 */
function makeInputs(
  overrides: Partial<ClipTransformInputs> = {},
): ClipTransformInputs {
  const notes: MidiNote[] = [
    { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
  ];

  return {
    notes,
    clipLength: 4,
    transformString: "velocity = 100",
    isAudio: false,
    endBeats: null,
    timeSigNumerator: 4,
    timeSigDenominator: 4,
    scaleMask: undefined,
    ...overrides,
  };
}

/**
 * Read the ClipContext passed to the (mocked) applyTransforms on its first call.
 * @returns The captured clip context, or undefined if not called
 */
function capturedContext() {
  return vi.mocked(applyTransforms).mock.calls[0]?.[4];
}

describe("resolveClipTransform", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(applyTransforms).mockReturnValue(3);
  });

  describe("early-return guard", () => {
    /**
     * Resolve inputs the guard should turn away, and check it did.
     * @param overrides - The operand this case makes fail the guard
     * @returns What resolveClipTransform handed back
     */
    function expectTransformSkipped(overrides: Partial<ClipTransformInputs>) {
      const inputs = makeInputs(overrides);

      const result = resolveClipTransform(inputs, 0, 1, null);

      expect(result.transformedCount).toBeUndefined();
      // The early return hands back the exact shared array, not a sorted clone.
      expect(result.notes).toBe(inputs.notes);
      expect(applyTransforms).not.toHaveBeenCalled();

      return result;
    }

    it("returns the shared notes/length unchanged when there is no transform", () => {
      const result = expectTransformSkipped({ transformString: null });

      expect(result.clipLength).toBe(4);
    });

    it("skips the transform for audio clips", () => {
      expectTransformSkipped({ isAudio: true });
    });

    it("skips the transform when there are no notes", () => {
      expectTransformSkipped({ notes: [] });
    });

    it("runs the transform when transform present, MIDI, and notes non-empty", () => {
      const inputs = makeInputs();

      const result = resolveClipTransform(inputs, 0, 1, null);

      expect(applyTransforms).toHaveBeenCalledOnce();
      expect(result.transformedCount).toBe(3);
      // A fresh sorted clone is returned, not the shared input array.
      expect(result.notes).not.toBe(inputs.notes);
    });
  });

  describe("clip context beat-scaling (buildCreateClipContext)", () => {
    it("scales clipDuration by timeSigDenominator/4", () => {
      // 8/4 denominator => beatScale 2; clipLength 4 => clipDuration 8.
      const inputs = makeInputs({ timeSigDenominator: 8, clipLength: 4 });

      resolveClipTransform(inputs, 0, 1, null);

      expect(capturedContext()?.clipDuration).toBe(8);
    });

    it("scales arrangementStart by the beatScale when provided", () => {
      // beatScale 2; arrangementStartBeats 16 => arrangementStart 32.
      const inputs = makeInputs({ timeSigDenominator: 8 });

      resolveClipTransform(inputs, 0, 1, 16);

      expect(capturedContext()?.arrangementStart).toBe(32);
    });

    it("leaves arrangementStart undefined for session clips (null start)", () => {
      const inputs = makeInputs({ timeSigDenominator: 8 });

      resolveClipTransform(inputs, 0, 1, null);

      expect(capturedContext()?.arrangementStart).toBeUndefined();
    });
  });
});
