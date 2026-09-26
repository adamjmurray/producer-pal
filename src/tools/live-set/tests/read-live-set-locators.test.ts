// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { type LocatorInfo } from "#src/tools/shared/locator/locators.ts";
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
    setupLocatorReadMocks({ cueChildren: ["26"] });

    const result = readLiveSet({ include: [] });

    expect(result.locators).toBeUndefined();
  });

  it("should include locators when requested", () => {
    setupLocatorReadMocks({
      cuePoints: {
        26: { name: "Intro", time: 0 },
        27: { name: "Verse", time: 16 },
      },
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "26", name: "Intro", time: "1|1", position: "loc:Intro" },
      { id: "27", name: "Verse", time: "5|1", position: "loc:Verse" },
    ]);
  });

  it("reads an all-digit locator name as a string", () => {
    setupLocatorReadMocks({
      cuePoints: { 26: { name: 5678, time: 0 } },
    });

    const result = readLiveSet({ include: ["locators"] });

    // An all-digit name would be read back as an id, so the position falls
    // back to the real one.
    expect(result.locators).toStrictEqual([
      { id: "26", name: "5678", time: "1|1", position: "loc:26" },
    ]);
  });

  it("reads a locator with no name property as an empty string", () => {
    // Guards the `?? ""` fallback: a missing name must not read back as the
    // literal string "undefined".
    setupLocatorReadMocks({
      cuePoints: { 26: { time: 0 } },
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "26", name: "", time: "1|1", position: "loc:26" },
    ]);
  });

  it("should handle empty locators array", () => {
    setupLocatorReadMocks();

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([]);
  });

  it("should format locator times correctly in different time signatures", () => {
    setupLocatorReadMocks({
      cuePoints: { 26: { name: "Chorus", time: 6 } },
      signatureNumerator: 3,
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "26", name: "Chorus", time: "3|1", position: "loc:Chorus" },
    ]);
  });

  it("should include locators with wildcard include", () => {
    setupLocatorReadMocks({
      cuePoints: { 26: { name: "Bridge", time: 32 } },
    });

    const result = readLiveSet({ include: ["*"] });

    expect(result.locators).toStrictEqual([
      { id: "26", name: "Bridge", time: "9|1", position: "loc:Bridge" },
    ]);
  });

  describe("the position a locator hands back", () => {
    it("names the locator, so a caller re-sends the section not the bar", () => {
      setupLocatorReadMocks({
        cuePoints: { 26: { name: "Bridge", time: 32 } },
      });

      expect(readLiveSet({ include: ["locators"] }).locators).toStrictEqual([
        {
          id: "26",
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
          26: { name: "Drop", time: 0 },
          27: { name: "Drop", time: 16 },
          28: { name: "Outro", time: 32 },
        },
      });

      expect(readPositions()).toStrictEqual(["loc:26", "loc:27", "loc:Outro"]);
    });

    // An all-digit name is read as an id, which points at whichever locator
    // carries it.
    it("falls back to the ID for an id-shaped name", () => {
      setupLocatorReadMocks({
        cuePoints: {
          26: { name: "Intro", time: 0 },
          27: { name: "26", time: 16 },
        },
      });

      expect(readPositions()).toStrictEqual(["loc:Intro", "loc:27"]);
    });

    // "[", "]" and "," are read by the path grammar before the name is, so
    // "t2[loc:A]B]" or a name with a comma would split into something else.
    it.each([["A]B"], ["A[B"], ["A,B"], [" Padded "]])(
      "falls back to the ID for the unusable name %j",
      (name) => {
        setupLocatorReadMocks({ cuePoints: { 26: { name, time: 0 } } });

        expect(readPositions()).toStrictEqual(["loc:26"]);
      },
    );
  });

  it("keeps a locator's ID when an earlier locator is deleted", () => {
    // The ID is Live's own, so it stays a handle a caller can send back a turn
    // later — deleting Intro must not renumber Outro.
    setupLocatorReadMocks({
      cuePoints: {
        26: { name: "Intro", time: 0 },
        27: { name: "Outro", time: 16 },
      },
    });

    expect(readLiveSet({ include: ["locators"] }).locators).toStrictEqual([
      { id: "26", name: "Intro", time: "1|1", position: "loc:Intro" },
      { id: "27", name: "Outro", time: "5|1", position: "loc:Outro" },
    ]);

    setupLocatorReadMocks({
      cuePoints: { 27: { name: "Outro", time: 16 } },
    });

    expect(readLiveSet({ include: ["locators"] }).locators).toStrictEqual([
      { id: "27", name: "Outro", time: "5|1", position: "loc:Outro" },
    ]);
  });
});
