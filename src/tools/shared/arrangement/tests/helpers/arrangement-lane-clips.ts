// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

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
