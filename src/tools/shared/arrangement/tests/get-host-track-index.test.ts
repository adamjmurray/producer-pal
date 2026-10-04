// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { getHostTrackIndex, groupsHostTrack } from "../get-host-track-index.ts";

const g = globalThis as Record<string, unknown>;

describe("getHostTrackIndex", () => {
  it("should return track index when device path matches pattern", () => {
    registerMockObject("this_device", {
      path: "this_device",
      returnPath: "live_set tracks 5 devices 0",
      properties: { trackIndex: 5 },
    });

    const result = getHostTrackIndex();

    expect(result).toBe(5);
  });

  it("should return null when device path does not match pattern", () => {
    registerMockObject("this_device", {
      path: "this_device",
      returnPath: "some other path without tracks",
    });

    const result = getHostTrackIndex();

    expect(result).toBe(null);
  });

  it("should return null when LiveAPI.from throws an error", () => {
    const originalLiveAPI = g.LiveAPI;

    g.LiveAPI = {
      from: vi.fn(() => {
        throw new Error("LiveAPI not available");
      }),
    };

    const result = getHostTrackIndex();

    expect(result).toBe(null);

    g.LiveAPI = originalLiveAPI;
  });

  it("should parse track index correctly for different track numbers", () => {
    const testCases = [
      { path: "live_set tracks 0 devices 0", expected: 0 },
      { path: "live_set tracks 123 devices 0", expected: 123 },
      { path: "live_set tracks 99 devices 1", expected: 99 },
    ];

    for (const { path, expected } of testCases) {
      registerMockObject("this_device", {
        path: "this_device",
        returnPath: path,
        properties: { trackIndex: expected },
      });

      const result = getHostTrackIndex();

      expect(result).toBe(expected);
    }
  });
});

describe("groupsHostTrack", () => {
  const groupNamed = (id: string) => ({ id }) as unknown as LiveAPI;

  /** Host track 2 sits in group 10, which sits in group 20. */
  function registerNestedGroups(): void {
    registerMockObject("host", {
      path: livePath.track(2),
      properties: { group_track: ["id", 10] },
    });
    registerMockObject("10", { properties: { group_track: ["id", 20] } });
    // An empty list reads as "not grouped"
    registerMockObject("20", { properties: { group_track: [] } });
  }

  it("returns false when there is no host track", () => {
    expect(groupsHostTrack(groupNamed("10"), null)).toBe(false);
  });

  it("finds the host track inside a nested group", () => {
    registerNestedGroups();

    expect(groupsHostTrack(groupNamed("10"), 2)).toBe(true);
    expect(groupsHostTrack(groupNamed("20"), 2)).toBe(true);
  });

  it("returns false for a group the host track isn't in", () => {
    registerNestedGroups();

    expect(groupsHostTrack(groupNamed("99"), 2)).toBe(false);
  });
});
