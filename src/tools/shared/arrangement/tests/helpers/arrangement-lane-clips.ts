// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  type ArrangementLane,
  type CompleteArrangementPosition,
} from "#src/tools/shared/validation/helpers/object-path-position.ts";

/**
 * A complete arrangement path, the way the parser hands one over.
 * @param lane - The lane the path names
 * @param position - The song position, bar|beat or `loc:`
 * @returns The parsed path
 */
export function positionPath(
  lane: ArrangementLane,
  position: string,
): CompleteArrangementPosition {
  return { kind: "arrangement-position", lane, position };
}

/**
 * Registers what track 0 answers as its own arrangement clips.
 * @param clipIds - The clip ids, in order
 */
export function registerTrackClips(...clipIds: string[]): void {
  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(...clipIds) },
  });
}

/** Registers one clip running from bar 3 through bar 6, and the track list. */
export function registerSpanningClip(): void {
  registerMockObject("clip_long", {
    path: livePath.track(0).arrangementClip(0),
    properties: { start_time: 8, end_time: 24 },
  });
  registerTrackClips("clip_long");
}

/** Registers back-to-back clips meeting at bar 5, and the track list. */
export function registerBoundaryClips(): void {
  registerMockObject("clip_before", {
    path: livePath.track(0).arrangementClip(0),
    properties: { start_time: 8, end_time: 16 },
  });
  registerMainLaneClip("clip_after", 16, 1);
  registerTrackClips("clip_before", "clip_after");
}

/**
 * Registers a clip on track 0's main arrangement lane.
 * @param id - The clip's id
 * @param startTime - Where it starts, in Ableton beats
 * @param index - Its index in the track's arrangement clips
 * @param endTime - Where it ends, in Ableton beats
 */
export function registerMainLaneClip(
  id: string,
  startTime: number,
  index = 0,
  endTime = startTime + 4,
): void {
  registerMockObject(id, {
    path: livePath.track(0).arrangementClip(index),
    type: "Clip",
    properties: { start_time: startTime, end_time: endTime },
  });
}

/**
 * Registers a one-bar clip on take lane 1 of track 0, and the lane holding it.
 * @param id - The clip's id
 * @param startTime - Where it starts, in Ableton beats
 */
export function registerTakeLaneClip(id: string, startTime: number): void {
  registerMockObject(id, {
    path: livePath.track(0).takeLane(1).arrangementClip(0),
    type: "Clip",
    properties: { start_time: startTime, end_time: startTime + 4 },
  });
  registerMockObject("lane_1", {
    path: livePath.track(0).takeLane(1),
    properties: { arrangement_clips: children(id) },
  });
}
