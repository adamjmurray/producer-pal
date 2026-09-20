// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyScale,
  applyTempo,
  applyTimeSignature,
  parseScale,
} from "../tempo-and-scale-updates.ts";

vi.mock(import("#src/shared/pitch.ts"), async (importOriginal) => {
  const original = await importOriginal();

  return {
    ...original,
    pitchClassToNumber: vi.fn(original.pitchClassToNumber),
  };
});

import { pitchClassToNumber } from "#src/shared/pitch.ts";

/** A live_set mock that stores what applyScale writes and reads it back. */
function mockLiveSetWithScaleState(): LiveAPI {
  const stored: Record<string, unknown> = {};

  return {
    set: vi.fn((property: string, value: unknown) => {
      stored[property] = value;
    }),
    getProperty: vi.fn((property: string) => stored[property]),
  } as unknown as LiveAPI;
}

/** What applyScale writes onto the tool's result. */
type ScaleResult = { scale?: string; reason?: string };

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

  describe("parseScale", () => {
    it("should parse valid scale string", () => {
      const result = parseScale("C Major");

      expect(result).toStrictEqual({
        scaleRoot: "C",
        scaleName: "Major",
        scaleRootNumber: 0,
      });
    });

    it("should handle case-insensitive root notes", () => {
      const result = parseScale("f# minor");

      expect(result).toStrictEqual({
        scaleRoot: "F#",
        scaleName: "Minor",
        scaleRootNumber: 6,
      });
    });

    it("should resolve an enharmonic root to its canonical spelling", () => {
      expect(parseScale("Cb Major")).toStrictEqual({
        scaleRoot: "B",
        scaleName: "Major",
        scaleRootNumber: 11,
      });
      expect(parseScale("e# minor")).toStrictEqual({
        scaleRoot: "F",
        scaleName: "Minor",
        scaleRootNumber: 5,
      });
    });

    it("should handle Bb (flat notation)", () => {
      const result = parseScale("Bb Dorian");

      expect(result).toStrictEqual({
        scaleRoot: "Bb",
        scaleName: "Dorian",
        scaleRootNumber: 10,
      });
    });

    it("should handle extra whitespace", () => {
      const result = parseScale("  D   Mixolydian  ");

      expect(result).toStrictEqual({
        scaleRoot: "D",
        scaleName: "Mixolydian",
        scaleRootNumber: 2,
      });
    });

    it("should throw for invalid format - single word", () => {
      expect(() => parseScale("CMajor")).toThrow(
        "Scale must be in format 'Root ScaleName'",
      );
    });

    it("should join a multi-word scale name with a space", () => {
      const result = parseScale("C Whole Tone");

      expect(result).toStrictEqual({
        scaleRoot: "C",
        scaleName: "Whole Tone",
        scaleRootNumber: 0,
      });
    });

    it("should throw for invalid root note, listing the valid roots", () => {
      expect(() => parseScale("X Major")).toThrow("Invalid scale root 'X'");
      expect(() => parseScale("X Major")).toThrow(/Valid roots: C, /);
    });

    it("should throw for invalid scale name, listing the valid scales", () => {
      expect(() => parseScale("C InvalidScale")).toThrow(
        "Invalid scale name 'InvalidScale'",
      );
      expect(() => parseScale("C InvalidScale")).toThrow(
        /Valid scales: Major, /,
      );
    });
  });

  describe("applyTempo", () => {
    it.each([120, 20, 999])("writes %i and says nothing about it", (tempo) => {
      const mockLiveSet = mockLiveSetWithScaleState();
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
      const mockLiveSet = mockLiveSetWithScaleState();
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

  describe("applyScale", () => {
    it("should disable scale mode when no scale is passed", () => {
      const mockLiveSet = { set: vi.fn() } as unknown as LiveAPI;
      const result: ScaleResult = {};

      applyScale(mockLiveSet, null, "", result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_mode", 0);
      expect(result).toStrictEqual({});
    });

    it("says nothing about a scale Live stores the way it was asked for", () => {
      const mockLiveSet = mockLiveSetWithScaleState();
      const result: ScaleResult = {};

      applyScale(mockLiveSet, parseScale("C Major"), "C Major", result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("root_note", 0);
      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_name", "Major");
      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_mode", 1);
      expect(result).toStrictEqual({});
    });

    it("reports a sharp root by the flat name Live stores", () => {
      // Live keeps only root_note, a pitch class number, so the result must
      // name it the way every read of it will.
      const mockLiveSet = mockLiveSetWithScaleState();
      const result: ScaleResult = {};

      applyScale(mockLiveSet, parseScale("F# Minor"), "F# Minor", result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("root_note", 6);
      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_name", "Minor");
      expect(result.scale).toBe("Gb Minor");
      expect(result.reason).toBe(
        "scale roots are spelled with flats, so F# comes back as Gb — " +
          "same scale, set correctly",
      );
    });

    it("says how a spelling the tools only tolerate is stored", () => {
      const mockLiveSet = mockLiveSetWithScaleState();
      const result: ScaleResult = {};

      applyScale(mockLiveSet, parseScale("bB DoRiAn"), "bB DoRiAn", result);

      expect(result.scale).toBe("Bb Dorian");
      expect(result.reason).toBe(
        "scale bB DoRiAn is spelled Bb Dorian — same scale, set correctly",
      );
    });

    it("should handle flat root notes", () => {
      const mockLiveSet = mockLiveSetWithScaleState();
      const result: ScaleResult = {};

      applyScale(mockLiveSet, parseScale("Bb Dorian"), "Bb Dorian", result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("root_note", 10);
      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_name", "Dorian");
      expect(result).toStrictEqual({});
    });

    it("falls back to the requested spelling when Live reports no usable root", () => {
      const mockLiveSet = {
        set: vi.fn(),
        getProperty: vi.fn((property: string) =>
          property === "scale_name" ? "Major" : -1,
        ),
      } as unknown as LiveAPI;
      const result: ScaleResult = {};

      applyScale(mockLiveSet, parseScale("C Major"), "C Major", result);

      expect(result).toStrictEqual({});
    });

    it("refuses a root that canonicalizes but has no pitch class", () => {
      // Defensive: canonicalizeScaleRoot accepted the root, so the second
      // lookup can only disagree if the two ever drift apart.
      vi.mocked(pitchClassToNumber).mockReturnValueOnce(null);

      expect(() => parseScale("C Major")).toThrow("Invalid scale root 'C'");
    });
  });
});
