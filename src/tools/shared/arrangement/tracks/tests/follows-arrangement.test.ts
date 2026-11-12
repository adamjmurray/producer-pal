// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  followsArrangement,
  owningTrackFollowsArrangement,
} from "../follows-arrangement.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

/**
 * @param liveVersion - The version Live reports
 */
function liveIs(liveVersion: string): void {
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => liveVersion },
  });
}

/**
 * Register a track and a device on it.
 * @param path - The track's path
 * @param playingSlot - What `playing_slot_index` reads
 * @returns The track mock and the device on it
 */
function trackWithDevice(
  path: string,
  playingSlot: number,
): { track: RegisteredMockObject; device: LiveAPI } {
  const track = registerMockObject("track", {
    path,
    type: "Track",
    properties: { playing_slot_index: playingSlot },
  });

  registerMockObject("device", { path: `${path} devices 0` });

  return { track, device: LiveAPI.from("id device") };
}

const READS_SLOT = "playing_slot_index";

describe("followsArrangement", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it.each([
    ["idle", -1, true],
    ["playing a clip", 0, false],
    ["stopped in Session", -2, false],
  ])(
    "treats a Live 13 return track %s like a regular one",
    (_how, slot, expected) => {
      liveIs("13.0");

      const { track } = trackWithDevice(String(livePath.returnTrack(0)), slot);

      expect(followsArrangement(LiveAPI.from("id track"))).toBe(expected);
      expect(track.get).toHaveBeenCalledWith(READS_SLOT);
    },
  );

  it("answers true for a Live 12 return track without asking it", () => {
    liveIs("12.3");

    const { track } = trackWithDevice(String(livePath.returnTrack(0)), 0);

    expect(followsArrangement(LiveAPI.from("id track"))).toBe(true);
    expect(track.get).not.toHaveBeenCalledWith(READS_SLOT);
  });

  it("answers true for the main track without asking it", () => {
    liveIs("13.0");

    const { track } = trackWithDevice(String(livePath.masterTrack()), 0);

    expect(followsArrangement(LiveAPI.from("id track"))).toBe(true);
    expect(track.get).not.toHaveBeenCalledWith(READS_SLOT);
  });

  it.each([
    ["Live 12", "12.3"],
    ["Live 13", "13.0"],
  ])("still reads a regular track's slot on %s", (_which, version) => {
    liveIs(version);
    trackWithDevice(String(livePath.track(0)), 0);

    expect(followsArrangement(LiveAPI.from("id track"))).toBe(false);
  });
});

describe("owningTrackFollowsArrangement", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it.each([
    ["idle", -1, true],
    ["playing a clip", 0, false],
    ["stopped in Session", -2, false],
  ])("follows a device's Live 13 return track %s", (_how, slot, expected) => {
    liveIs("13.0");

    const { device } = trackWithDevice(String(livePath.returnTrack(1)), slot);

    expect(owningTrackFollowsArrangement(device)).toBe(expected);
  });

  it("answers true for a Live 12 return track's device without asking the track", () => {
    liveIs("12.3");

    const { track, device } = trackWithDevice(
      String(livePath.returnTrack(0)),
      0,
    );

    expect(owningTrackFollowsArrangement(device)).toBe(true);
    expect(track.get).not.toHaveBeenCalledWith(READS_SLOT);
  });

  it("reads a regular track's slot, and ignores the main track's", () => {
    liveIs("13.0");

    const regular = trackWithDevice(String(livePath.track(0)), 0);

    expect(owningTrackFollowsArrangement(regular.device)).toBe(false);

    clearMockRegistry();
    liveIs("13.0");

    const main = trackWithDevice(String(livePath.masterTrack()), 0);

    expect(owningTrackFollowsArrangement(main.device)).toBe(true);
  });

  it("answers true for an object on no track", () => {
    liveIs("13.0");
    registerMockObject("loose", { path: "live_set" });

    expect(owningTrackFollowsArrangement(LiveAPI.from("id loose"))).toBe(true);
  });
});
