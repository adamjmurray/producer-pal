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
