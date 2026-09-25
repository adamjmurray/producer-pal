// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as consoleModule from "#src/shared/max/v8-max-console.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { processWarpMarkers } from "#src/tools/clip/read/helpers/clip-region-and-warp.ts";

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

describe("processWarpMarkers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("returns markers for a direct array, with nothing to report", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    const result = processWarpMarkers(
      warpClip(JSON.stringify([{ sample_time: 44100, beat_time: 1 }])),
    );

    expect(result).toStrictEqual({
      markers: [{ sampleTime: 44100, beatTime: 1 }],
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty string", ""],
    ["missing", undefined],
    ["an object with no warp_markers key", "{}"],
    ["a non-array value", JSON.stringify({ warp_markers: 42 })],
  ])("returns nothing at all when warp_markers is %s", (_label, value) => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    expect(processWarpMarkers(warpClip(value))).toStrictEqual({});
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("reports the reason on the clip when the JSON cannot be parsed", () => {
    const consoleSpy = vi.spyOn(consoleModule, "warn");

    const result = processWarpMarkers(warpClip("invalid json{"));

    expect(result.markers).toBeUndefined();
    expect(result.detail).toContain("warpMarkers unreadable:");
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
