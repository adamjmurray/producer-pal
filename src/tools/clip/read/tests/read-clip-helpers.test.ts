// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as consoleModule from "#src/shared/max/v8-max-console.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  isDrumRackTrack,
  processWarpMarkers,
  resolveClip,
} from "#src/tools/clip/read/helpers/read-clip-helpers.ts";

/**
 * Build a minimal clip stub whose warp_markers property returns `value`.
 * @param value - The value getProperty("warp_markers") should return
 * @returns A LiveAPI-shaped stub for processWarpMarkers
 */
function warpClip(value: unknown): LiveAPI {
  return {
    id: "clip1",
    getProperty: vi.fn((prop: string) =>
      prop === "warp_markers" ? value : undefined,
    ),
  } as unknown as LiveAPI;
}

describe("resolveClip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("says what a non-clip id actually named", () => {
    registerMockObject("faketrack", {
      path: livePath.track(7),
      type: "Track",
    });

    expect(() => resolveClip("id faketrack", null, null)).toThrow(
      "is not a clip (found Track)",
    );
  });
});

describe("processWarpMarkers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("returns markers for a direct array without warning", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    const result = processWarpMarkers(
      warpClip(JSON.stringify([{ sample_time: 44100, beat_time: 1 }])),
    );

    expect(result).toStrictEqual([{ sampleTime: 44100, beatTime: 1 }]);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("returns undefined without warning when warp_markers is an empty string", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    expect(processWarpMarkers(warpClip(""))).toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("returns undefined without warning when warp_markers is missing", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    expect(processWarpMarkers(warpClip(undefined))).toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("returns undefined without warning for an object with no warp_markers key", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    expect(processWarpMarkers(warpClip("{}"))).toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("returns undefined without warning when warp_markers is a non-array value", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    expect(
      processWarpMarkers(warpClip(JSON.stringify({ warp_markers: 42 }))),
    ).toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("warns with a descriptive message when the JSON cannot be parsed", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    const result = processWarpMarkers(warpClip("invalid json{"));

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read warp markers for clip id clip1"),
    );
  });
});

/**
 * Register track 0 holding one non-drum rack whose single chain holds a Drum
 * Rack. Only `can_have_chains` varies, so it decides whether the recursion
 * reaches that nested Drum Rack.
 * @param rackId - Mock-registry id for the outer rack
 * @param canHaveChains - The outer rack's can_have_chains value
 */
function registerRackOverDrumRack(rackId: string, canHaveChains: number): void {
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children(rackId) },
  });
  registerMockObject(rackId, {
    type: "Device",
    properties: {
      can_have_drum_pads: 0,
      can_have_chains: canHaveChains,
      chains: children("innerChain"),
    },
  });
  registerMockObject("innerChain", {
    type: "Chain",
    properties: { devices: children("drumRack") },
  });
  registerMockObject("drumRack", {
    type: "Device",
    properties: { can_have_drum_pads: 1 },
  });
}

describe("isDrumRackTrack - chain descent guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("does not descend into the chains of a device that reports no chains", () => {
    // The device has chain children holding a Drum Rack, but can_have_chains is
    // 0 — the recursion must NOT descend, so the track is not a drum track.
    registerRackOverDrumRack("fakeRack", 0);

    expect(isDrumRackTrack(0)).toBe(false);
  });

  it("descends into the chains of a real rack (can_have_chains > 0)", () => {
    // Same chain layout, but the rack reports can_have_chains: 1, so the nested
    // Drum Rack IS found. Pins the guard's true branch against the false one.
    registerRackOverDrumRack("realRack", 1);

    expect(isDrumRackTrack(0)).toBe(true);
  });
});
