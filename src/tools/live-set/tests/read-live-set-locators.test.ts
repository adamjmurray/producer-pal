// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

interface SetupLocatorReadMocksOptions {
  cuePoints?: Record<string, { name: string; time: number }>;
  cueChildren?: string[];
  signatureNumerator?: number;
}

/**
 * Setup registry-based mocks for locator read tests.
 * @param options - Configuration options
 * @param options.cuePoints - Cue point data keyed by ID
 * @param options.cueChildren - Override cue_points children list (defaults to cuePoints keys)
 * @param options.signatureNumerator - Time signature numerator (defaults to 4)
 */
function setupLocatorReadMocks({
  cuePoints = {},
  cueChildren,
  signatureNumerator = 4,
}: SetupLocatorReadMocksOptions = {}): void {
  const cueIds = cueChildren ?? Object.keys(cuePoints);

  setupLiveSetPathMappedMocks({
    liveSetId: "live_set_id",
    pathIdMap: {
      "live_set master_track": "master",
    },
    objects: {
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: signatureNumerator,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: cueIds.length > 0 ? children(...cueIds) : [],
      },
      "live_set master_track": {
        has_midi_input: 0,
        name: "Master",
        devices: [],
      },
      ...cuePoints,
    },
  });
}

describe("readLiveSet - locators", () => {
  it("should not include locators by default", () => {
    setupLocatorReadMocks({ cueChildren: ["cue1"] });

    const result = readLiveSet({ include: [] });

    expect(result.locators).toBeUndefined();
  });

  it("should include locators when requested", () => {
    setupLocatorReadMocks({
      cuePoints: {
        cue1: { name: "Intro", time: 0 },
        cue2: { name: "Verse", time: 16 },
      },
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "Intro", time: "1|1" },
      { id: "locator-1", name: "Verse", time: "5|1" },
    ]);
  });

  it("should handle empty locators array", () => {
    setupLocatorReadMocks();

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([]);
  });

  it("should format locator times correctly in different time signatures", () => {
    setupLocatorReadMocks({
      cuePoints: { cue1: { name: "Chorus", time: 6 } },
      signatureNumerator: 3,
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "Chorus", time: "3|1" },
    ]);
  });

  it("should include locators with wildcard include", () => {
    setupLocatorReadMocks({
      cuePoints: { cue1: { name: "Bridge", time: 32 } },
    });

    const result = readLiveSet({ include: ["*"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "Bridge", time: "9|1" },
    ]);
  });
});
