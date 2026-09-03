// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setupCuePointMocksRegistry } from "#src/test/helpers/cue-point-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { arrangementClipAtPosition } from "../arrangement-clip-at-position.ts";
import {
  type CompleteArrangementPosition,
  type ExistingArrangementLane,
} from "#src/tools/shared/validation/helpers/object-path-coord.ts";

const LABELS = { toolName: "updateClip", paramName: "path" };
const MAIN_LANE: ExistingArrangementLane = { kind: "track", trackIndex: 0 };
const TAKE_LANE: ExistingArrangementLane = {
  kind: "take-lane",
  trackIndex: 0,
  laneIndex: 1,
};

/**
 * A complete arrangement path, the way the parser hands one over.
 * @param lane - The lane the path names
 * @param position - The song position, bar|beat or `loc:`
 * @returns The parsed path
 */
function at(
  lane: ExistingArrangementLane,
  position: string,
): CompleteArrangementPosition {
  return { kind: "arrangement-position", lane, position };
}

/**
 * Registers a clip on the track's main lane.
 * @param id - The clip's id
 * @param startTime - Where it starts, in Ableton beats
 * @param index - Its index in the track's arrangement clips
 */
function registerMainLaneClip(id: string, startTime: number, index = 0): void {
  registerMockObject(id, {
    path: livePath.track(0).arrangementClip(index),
    properties: { start_time: startTime },
  });
}

/**
 * Registers a clip on take lane 1 of track 0.
 * @param id - The clip's id
 * @param startTime - Where it starts, in Ableton beats
 */
function registerTakeLaneClip(id: string, startTime: number): void {
  registerMockObject(id, {
    path: livePath.track(0).takeLane(1).arrangementClip(0),
    properties: { start_time: startTime },
  });
  registerMockObject("lane_1", {
    path: livePath.track(0).takeLane(1),
    properties: { arrangement_clips: children(id) },
  });
}

/**
 * Registers what track 0 answers as its own arrangement clips.
 * @param clipIds - The clip ids, in order
 */
function registerTrackClips(...clipIds: string[]): void {
  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(...clipIds) },
  });
}

describe("arrangementClipAtPosition", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
  });

  // 4/4, so bar 5 is beat 16. The epsilon case is the point of the comparison:
  // a start time Live rounded off still names the clip the caller meant.
  it.each([
    ["exactly", 16],
    ["within the same-time epsilon", 16.0001],
  ])("finds the main-lane clip starting %s there", (_name, startTime) => {
    registerMainLaneClip("clip_main", startTime);
    registerTrackClips("clip_main");

    expect(arrangementClipAtPosition(at(MAIN_LANE, "5|1"), LABELS)?.id).toBe(
      "clip_main",
    );
  });

  it("finds the clip on the take lane the path names", () => {
    registerTakeLaneClip("clip_take", 16);
    registerTrackClips();

    expect(arrangementClipAtPosition(at(TAKE_LANE, "5|1"), LABELS)?.id).toBe(
      "clip_take",
    );
  });

  it("resolves a locator position", () => {
    setupCuePointMocksRegistry({
      cuePoints: [{ id: "cue1", time: 16, name: "Verse" }],
    });
    registerMainLaneClip("clip_main", 16);
    registerTrackClips("clip_main");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "loc:Verse"), LABELS)?.id,
    ).toBe("clip_main");
  });

  it("names nothing when no clip starts there", () => {
    registerMainLaneClip("clip_main", 16);
    registerTrackClips("clip_main");

    expect(arrangementClipAtPosition(at(MAIN_LANE, "9|1"), LABELS)).toBeNull();
  });

  // "starts at", not "covers": a clip running from 3|1 through bar 6 is not the
  // clip at 5|1 (ADR-0037).
  it("does not match a clip that only spans the position", () => {
    registerMockObject("clip_long", {
      path: livePath.track(0).arrangementClip(0),
      properties: { start_time: 8, end_time: 24 },
    });
    registerTrackClips("clip_long");

    expect(arrangementClipAtPosition(at(MAIN_LANE, "5|1"), LABELS)).toBeNull();
  });

  // The lane is part of the address. Whether Live's own track-level
  // arrangement_clips lists take-lane clips or not, a main-lane path answers
  // with a main-lane clip or nothing.
  it("does not match a take-lane clip from a main-lane path", () => {
    registerTakeLaneClip("clip_take", 16);
    registerTrackClips("clip_take");

    expect(arrangementClipAtPosition(at(MAIN_LANE, "5|1"), LABELS)).toBeNull();
    expect(arrangementClipAtPosition(at(TAKE_LANE, "5|1"), LABELS)?.id).toBe(
      "clip_take",
    );
  });
});
