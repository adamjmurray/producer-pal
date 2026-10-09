// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  laneViewOf,
  type LaneView,
} from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";

/** Parking lands on a whole bar of 4/4, which is all the spot needs to be. */
const BAR_BEATS = 4;

/**
 * Where a clip can be parked on a track without touching anything: a bar past
 * the end of the Set and of the last clip on any of the track's lanes. The copy
 * made there grows the Set, and deleting it shrinks the Set back.
 * @param trackIndex - The track the clip is parked on
 * @param context - The call's context, which carries its lane view
 * @returns The position, in beats
 */
export function parkingSpot(
  trackIndex: number,
  context: { lanes?: LaneView },
): number {
  const lanes = laneViewOf(context);
  const takeLanes = LiveAPI.from(livePath.track(trackIndex)).getChildCount(
    "take_lanes",
  );
  const ends = [
    LiveAPI.from(livePath.liveSet).getProperty("song_length") as number,
    lanes.lastEnd({ kind: "track", trackIndex }),
  ];

  for (let laneIndex = 0; laneIndex < takeLanes; laneIndex++) {
    ends.push(lanes.lastEnd({ kind: "take-lane", trackIndex, laneIndex }));
  }

  return (Math.ceil(Math.max(...ends) / BAR_BEATS) + 1) * BAR_BEATS;
}
