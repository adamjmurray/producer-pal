// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { applyScale } from "../scale-writing.ts";
import { parseScale } from "../scale-parsing.ts";

/** A target mock that stores what applyScale writes and reads it back. */
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
type ScaleResult = { scale?: string; detail?: string };

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
    expect(result.detail).toBe(
      "scale roots are spelled with flats, so F# comes back as Gb — " +
        "same scale, set correctly",
    );
  });

  it("says how a spelling the tools only tolerate is stored", () => {
    const mockLiveSet = mockLiveSetWithScaleState();
    const result: ScaleResult = {};

    applyScale(mockLiveSet, parseScale("bB DoRiAn"), "bB DoRiAn", result);

    expect(result.scale).toBe("Bb Dorian");
    expect(result.detail).toBe(
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

  it("calls landed after the first write, so a later throw can say so", () => {
    const calls: string[] = [];
    const target = {
      set: vi.fn((property: string) => {
        calls.push(`set ${property}`);

        if (property === "scale_name") {
          throw new Error("boom");
        }
      }),
      getProperty: vi.fn(),
    } as unknown as LiveAPI;

    expect(() =>
      applyScale(target, parseScale("C Major"), "C Major", {}, () =>
        calls.push("landed"),
      ),
    ).toThrow("boom");
    expect(calls).toStrictEqual(["set root_note", "landed", "set scale_name"]);
  });

  it("calls landed after switching the scale off", () => {
    const landed = vi.fn();
    const target = { set: vi.fn() } as unknown as LiveAPI;

    applyScale(target, null, "", {}, landed);

    expect(landed).toHaveBeenCalledTimes(1);
  });
});
