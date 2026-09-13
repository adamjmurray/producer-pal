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
  type ArrangementLane,
} from "#src/tools/shared/validation/helpers/object-path-coord.ts";

const PARAM_NAME = "path";
const MAIN_LANE: ArrangementLane = { kind: "track", trackIndex: 0 };
const TAKE_LANE: ArrangementLane = {
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
  lane: ArrangementLane,
  position: string,
): CompleteArrangementPosition {
  return { kind: "arrangement-position", lane, position };
}

/**
 * Registers a clip on the track's main lane.
 * @param id - The clip's id
 * @param startTime - Where it starts, in Ableton beats
 * @param index - Its index in the track's arrangement clips
 * @param endTime - Where it ends, in Ableton beats
 */
function registerMainLaneClip(
  id: string,
  startTime: number,
  index = 0,
  endTime = startTime + 4,
): void {
  registerMockObject(id, {
    path: livePath.track(0).arrangementClip(index),
    properties: { start_time: startTime, end_time: endTime },
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
    properties: { start_time: startTime, end_time: startTime + 4 },
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

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_main");
  });

  it("finds the clip on the take lane the path names", () => {
    registerTakeLaneClip("clip_take", 16);
    registerTrackClips();

    expect(
      arrangementClipAtPosition(at(TAKE_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_take");
  });

  it("resolves a locator position", () => {
    setupCuePointMocksRegistry({
      cuePoints: [{ id: "cue1", time: 16, name: "Verse" }],
    });
    registerMainLaneClip("clip_main", 16);
    registerTrackClips("clip_main");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "loc:Verse"), PARAM_NAME)?.id,
    ).toBe("clip_main");
  });

  it("names nothing when no clip starts there", () => {
    registerMainLaneClip("clip_main", 16);
    registerTrackClips("clip_main");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "9|1"), PARAM_NAME),
    ).toBeNull();
  });

  // A path is an address, not a "starts at": a clip running from bar 3 through
  // bar 6 is the clip at 5|1 (ADR-0037).
  it("finds a clip that only spans the position, not starts there", () => {
    registerMockObject("clip_long", {
      path: livePath.track(0).arrangementClip(0),
      properties: { start_time: 8, end_time: 24 },
    });
    registerTrackClips("clip_long");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_long");
  });

  // A clip's end is exclusive: back-to-back clips at the boundary resolve to
  // the one starting there, never the one ending there.
  it("resolves a boundary between two clips to the one starting there", () => {
    registerMockObject("clip_before", {
      path: livePath.track(0).arrangementClip(0),
      properties: { start_time: 8, end_time: 16 },
    });
    registerMainLaneClip("clip_after", 16, 1);
    registerTrackClips("clip_before", "clip_after");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_after");
  });

  it("finds a take-lane clip that only spans the position", () => {
    registerMockObject("clip_take_long", {
      path: livePath.track(0).takeLane(1).arrangementClip(0),
      properties: { start_time: 8, end_time: 24 },
    });
    registerMockObject("lane_1", {
      path: livePath.track(0).takeLane(1),
      properties: { arrangement_clips: children("clip_take_long") },
    });
    registerTrackClips();

    expect(
      arrangementClipAtPosition(at(TAKE_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_take_long");
  });

  // The lane is part of the address. Whether Live's own track-level
  // arrangement_clips lists take-lane clips or not, a main-lane path answers
  // with a main-lane clip or nothing.
  it("does not match a take-lane clip from a main-lane path", () => {
    registerTakeLaneClip("clip_take", 16);
    registerTrackClips("clip_take");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "5|1"), PARAM_NAME),
    ).toBeNull();
    expect(
      arrangementClipAtPosition(at(TAKE_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_take");
  });
});
