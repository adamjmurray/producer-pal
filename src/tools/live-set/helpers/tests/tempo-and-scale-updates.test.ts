// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyScale,
  applyTempo,
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
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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

describe("tempo-and-scale-updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseScale", () => {
    it("should parse valid scale string", () => {
      const result = parseScale("C Major");

      expect(result).toStrictEqual({ scaleRoot: "C", scaleName: "Major" });
    });

    it("should handle case-insensitive root notes", () => {
      const result = parseScale("f# minor");

      expect(result).toStrictEqual({ scaleRoot: "F#", scaleName: "Minor" });
    });

    it("should resolve an enharmonic root to its canonical spelling", () => {
      expect(parseScale("Cb Major")).toStrictEqual({
        scaleRoot: "B",
        scaleName: "Major",
      });
      expect(parseScale("e# minor")).toStrictEqual({
        scaleRoot: "F",
        scaleName: "Minor",
      });
    });

    it("should handle Bb (flat notation)", () => {
      const result = parseScale("Bb Dorian");

      expect(result).toStrictEqual({ scaleRoot: "Bb", scaleName: "Dorian" });
    });

    it("should handle extra whitespace", () => {
      const result = parseScale("  D   Mixolydian  ");

      expect(result).toStrictEqual({ scaleRoot: "D", scaleName: "Mixolydian" });
    });

    it("should throw for invalid format - single word", () => {
      expect(() => parseScale("CMajor")).toThrow(
        "Scale must be in format 'Root ScaleName'",
      );
    });

    it("should join a multi-word scale name with a space", () => {
      const result = parseScale("C Whole Tone");

      expect(result).toStrictEqual({ scaleRoot: "C", scaleName: "Whole Tone" });
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
    it("should set tempo on live set for valid value", () => {
      const mockLiveSet = { set: vi.fn() } as unknown as LiveAPI;
      const result: { tempo?: number } = {};

      applyTempo(mockLiveSet, 120, result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("tempo", 120);
      expect(result.tempo).toBe(120);
    });

    it("should accept minimum tempo of 20 BPM", () => {
      const mockLiveSet = { set: vi.fn() } as unknown as LiveAPI;
      const result: { tempo?: number } = {};

      applyTempo(mockLiveSet, 20, result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("tempo", 20);
      expect(result.tempo).toBe(20);
    });

    it("should accept maximum tempo of 999 BPM", () => {
      const mockLiveSet = { set: vi.fn() } as unknown as LiveAPI;
      const result: { tempo?: number } = {};

      applyTempo(mockLiveSet, 999, result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("tempo", 999);
      expect(result.tempo).toBe(999);
    });

    // The range is refused by validateTempo before updateLiveSet writes
    // anything, so by here the value is known good. See update-live-set.test.ts.
    it("writes a boundary tempo", () => {
      const mockLiveSet = { set: vi.fn() } as unknown as LiveAPI;
      const result: { tempo?: number } = {};

      applyTempo(mockLiveSet, 20, result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("tempo", 20);
      expect(result.tempo).toBe(20);
    });
  });

  describe("applyScale", () => {
    it("should disable scale mode when empty string is passed", () => {
      const mockLiveSet = { set: vi.fn() } as unknown as LiveAPI;
      const result: { scale?: string } = {};

      const respelled = applyScale(mockLiveSet, "", result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_mode", 0);
      expect(result.scale).toBe("");
      expect(respelled).toBeNull();
    });

    it("should warn and skip without throwing for an invalid scale string", () => {
      const mockLiveSet = { set: vi.fn() } as unknown as LiveAPI;
      const result: { scale?: string } = {};

      // parseScale throws for these; applyScale must catch, warn, and skip.
      for (const scale of ["invalid", "H Major", "C Foo"]) {
        expect(() => applyScale(mockLiveSet, scale, result)).not.toThrow();
      }

      expect(mockLiveSet.set).not.toHaveBeenCalled();
      expect(result.scale).toBeUndefined();
    });

    it("should set scale properties for valid scale string", () => {
      const mockLiveSet = mockLiveSetWithScaleState();
      const result: { scale?: string } = {};

      applyScale(mockLiveSet, "C Major", result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("root_note", 0);
      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_name", "Major");
      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_mode", 1);
      expect(result.scale).toBe("C Major");
    });

    it("reports a sharp root by the flat name Live stores", () => {
      // Live keeps only root_note, a pitch class number, so the result must
      // name it the way every read of it will.
      const mockLiveSet = mockLiveSetWithScaleState();
      const result: { scale?: string } = {};

      const respelled = applyScale(mockLiveSet, "F# Minor", result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("root_note", 6);
      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_name", "Minor");
      expect(result.scale).toBe("Gb Minor");
      expect(respelled).toStrictEqual({
        requestedRoot: "F#",
        storedRoot: "Gb",
      });
    });

    it("should handle flat root notes", () => {
      const mockLiveSet = mockLiveSetWithScaleState();
      const result: { scale?: string } = {};

      const respelled = applyScale(mockLiveSet, "Bb Dorian", result);

      expect(mockLiveSet.set).toHaveBeenCalledWith("root_note", 10);
      expect(mockLiveSet.set).toHaveBeenCalledWith("scale_name", "Dorian");
      expect(result.scale).toBe("Bb Dorian");
      expect(respelled).toBeNull();
    });

    it("falls back to the requested spelling when Live reports no usable root", () => {
      const mockLiveSet = {
        set: vi.fn(),
        getProperty: vi.fn((property: string) =>
          property === "scale_name" ? "Major" : -1,
        ),
      } as unknown as LiveAPI;
      const result: { scale?: string } = {};

      const respelled = applyScale(mockLiveSet, "C Major", result);

      expect(result.scale).toBe("C Major");
      expect(respelled).toBeNull();
    });

    it("should warn and return when pitchClassToNumber returns null", () => {
      // Defensive branch when pitchClassToNumber returns null
      // for a scale root that parseScale accepted. Mock pitchClassToNumber
      // to return null to trigger this branch.
      const mock = vi.mocked(pitchClassToNumber);

      mock.mockReturnValueOnce(null);

      const mockLiveSet = { set: vi.fn() } as unknown as LiveAPI;
      const result: { scale?: string } = {};

      applyScale(mockLiveSet, "C Major", result);

      expect(mockLiveSet.set).not.toHaveBeenCalled();
      expect(result.scale).toBeUndefined();
      expect(capturedWarnings()).toContain("invalid scale root: C");
    });
  });
});
