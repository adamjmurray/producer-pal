// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockScaleTarget } from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { applyTempo, applyTimeSignature } from "../tempo-and-scale-updates.ts";

/** A live_set mock that answers with `held`, whatever is written to it. */
function mockLiveSetHolding(held: Record<string, unknown>): LiveAPI {
  return {
    set: vi.fn(),
    getProperty: vi.fn((property: string) => held[property]),
  } as unknown as LiveAPI;
}

describe("tempo-and-scale-updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applyTempo", () => {
    it.each([120, 20, 999])("writes %i and says nothing about it", (tempo) => {
      const mockLiveSet = mockScaleTarget();
      const result: { tempo?: number } = {};

      applyTempo(mockLiveSet, tempo, result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("tempo", tempo);
      // The caller asked for it and Live kept it, so there is nothing to say.
      expect(result.tempo).toBeUndefined();
    });

    it("reports the tempo Live kept instead", () => {
      const mockLiveSet = mockLiveSetHolding({ tempo: 20 });
      const result: { tempo?: number } = {};

      applyTempo(mockLiveSet, 19.5, result);

      expect(result.tempo).toBe(20);
    });

    it("counts a tempo Live rounded past the 2nd decimal as kept", () => {
      const mockLiveSet = mockLiveSetHolding({ tempo: 123.456789 });
      const result: { tempo?: number } = {};

      applyTempo(mockLiveSet, 123.46, result);

      expect(result.tempo).toBeUndefined();
    });

    it("reports a tempo that doesn't read back as a number", () => {
      // Nothing to compare 120 with, so the caller only learns what the Set
      // holds if the label a read would publish is reported.
      const mockLiveSet = mockLiveSetHolding({ tempo: "-" });
      const result: { tempo?: number | string } = {};

      applyTempo(mockLiveSet, 120, result);

      expect(result.tempo).toBe("-");
    });
  });

  describe("applyTimeSignature", () => {
    it("writes both halves and says nothing about the one Live kept", () => {
      const mockLiveSet = mockScaleTarget();
      const result: { timeSignature?: string } = {};

      applyTimeSignature(mockLiveSet, { numerator: 6, denominator: 8 }, result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("signature_numerator", 6);
      expect(mockLiveSet.set).toHaveBeenCalledWith("signature_denominator", 8);
      expect(result.timeSignature).toBeUndefined();
    });

    it("reports the time signature Live kept instead", () => {
      const mockLiveSet = mockLiveSetHolding({
        signature_numerator: 4,
        signature_denominator: 4,
      });
      const result: { timeSignature?: string } = {};

      applyTimeSignature(mockLiveSet, { numerator: 7, denominator: 8 }, result);

      expect(result.timeSignature).toBe("4/4");
    });
  });
});
