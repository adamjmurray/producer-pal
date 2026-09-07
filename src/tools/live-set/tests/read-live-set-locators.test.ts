// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { type LocatorInfo } from "#src/tools/shared/locator/locator-helpers.ts";
import {
  masterTrackMockObject,
  setupLiveSetPathMappedMocks,
} from "./read-live-set-path-mapped-test-helpers.ts";

interface SetupLocatorReadMocksOptions {
  // number simulates Live returning an all-digit name as a number, not a
  // string; omitting name simulates a missing name property
  cuePoints?: Record<string, { name?: string | number; time: number }>;
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
      [String(livePath.masterTrack())]: "master",
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
      ...masterTrackMockObject(),
      ...cuePoints,
    },
  });
}

/**
 * The `position` every locator hands back, in order.
 * @returns One "loc:..." token per locator
 */
function readPositions(): string[] {
  return (readLiveSet({ include: ["locators"] }).locators as LocatorInfo[]).map(
    (locator) => locator.position,
  );
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
      { id: "locator-0", name: "Intro", time: "1|1", position: "loc:Intro" },
      { id: "locator-1", name: "Verse", time: "5|1", position: "loc:Verse" },
    ]);
  });

  it("reads an all-digit locator name as a string", () => {
    setupLocatorReadMocks({
      cuePoints: { cue1: { name: 5678, time: 0 } },
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "5678", time: "1|1", position: "loc:5678" },
    ]);
  });

  it("reads a locator with no name property as an empty string", () => {
    // Guards the `?? ""` fallback: a missing name must not read back as the
    // literal string "undefined".
    setupLocatorReadMocks({
      cuePoints: { cue1: { time: 0 } },
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "", time: "1|1", position: "loc:locator-0" },
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
      { id: "locator-0", name: "Chorus", time: "3|1", position: "loc:Chorus" },
    ]);
  });

  it("should include locators with wildcard include", () => {
    setupLocatorReadMocks({
      cuePoints: { cue1: { name: "Bridge", time: 32 } },
    });

    const result = readLiveSet({ include: ["*"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "Bridge", time: "9|1", position: "loc:Bridge" },
    ]);
  });

  describe("the position a locator hands back", () => {
    it("names the locator, so a caller re-sends the section not the bar", () => {
      setupLocatorReadMocks({
        cuePoints: { cue1: { name: "Bridge", time: 32 } },
      });

      expect(readLiveSet({ include: ["locators"] }).locators).toStrictEqual([
        {
          id: "locator-0",
          name: "Bridge",
          time: "9|1",
          position: "loc:Bridge",
        },
      ]);
    });

    // A repeated name resolves to the first match, so the later one would send
    // a caller to the wrong spot.
    it("falls back to the ID when two locators share a name", () => {
      setupLocatorReadMocks({
        cuePoints: {
          cue1: { name: "Drop", time: 0 },
          cue2: { name: "Drop", time: 16 },
          cue3: { name: "Outro", time: 32 },
        },
      });

      expect(readPositions()).toStrictEqual([
        "loc:locator-0",
        "loc:locator-1",
        "loc:Outro",
      ]);
    });

    // An id-shaped name resolves as a positional id, which points at whichever
    // locator sits at that index.
    it("falls back to the ID for an id-shaped name", () => {
      setupLocatorReadMocks({
        cuePoints: {
          cue1: { name: "Intro", time: 0 },
          cue2: { name: "locator-0", time: 16 },
        },
      });

      expect(readPositions()).toStrictEqual(["loc:Intro", "loc:locator-1"]);
    });

    // "[", "]" and "," are read by the path grammar before the name is, so
    // "t2[loc:A]B]" or a name with a comma would split into something else.
    it.each([["A]B"], ["A[B"], ["A,B"], [" Padded "]])(
      "falls back to the ID for the unusable name %j",
      (name) => {
        setupLocatorReadMocks({ cuePoints: { cue1: { name, time: 0 } } });

        expect(readPositions()).toStrictEqual(["loc:locator-0"]);
      },
    );
  });

  it("assigns positional IDs that shift when an earlier locator is added (M5: IDs are not stable handles)", () => {
    // Document the foot-gun: a locator ID is the current time-ordered position,
    // so the SAME locator gets a different ID once another is inserted before
    // it. A remembered "delete locator-1" can therefore hit the wrong locator —
    // delete/rename should reference locators by name or time, which are stable.
    setupLocatorReadMocks({
      cuePoints: {
        cue1: { name: "Intro", time: 0 },
        cue2: { name: "Outro", time: 16 },
      },
    });

    expect(readLiveSet({ include: ["locators"] }).locators).toStrictEqual([
      { id: "locator-0", name: "Intro", time: "1|1", position: "loc:Intro" },
      { id: "locator-1", name: "Outro", time: "5|1", position: "loc:Outro" },
    ]);

    // Insert a Verse before Outro: cue_points reorder, so Outro moves to index 2.
    setupLocatorReadMocks({
      cuePoints: {
        cue1: { name: "Intro", time: 0 },
        cue3: { name: "Verse", time: 8 },
        cue2: { name: "Outro", time: 16 },
      },
    });

    // Outro kept its name and time but its positional ID changed 1 → 2.
    expect(readLiveSet({ include: ["locators"] }).locators).toStrictEqual([
      { id: "locator-0", name: "Intro", time: "1|1", position: "loc:Intro" },
      { id: "locator-1", name: "Verse", time: "3|1", position: "loc:Verse" },
      { id: "locator-2", name: "Outro", time: "5|1", position: "loc:Outro" },
    ]);
  });
});
