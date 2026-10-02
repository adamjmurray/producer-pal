// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Selecting a spot on the arrangement timeline: `t0[5|1]`, or `t0/l0[5|1]` on a
// take lane. The spot itself is the Live Set's arrangement start marker, and a
// clip covering it is selected the way any other clip is.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { arrangementPositionTarget } from "#src/tools/shared/arrangement/helpers/arrangement-clip-at-position.ts";
import { type CompleteArrangementPosition } from "#src/tools/shared/validation/helpers/object-path-position.ts";

/** What a position path names, before any of it is written. */
export interface ArrangementPositionTargets {
  /** Where the start marker goes, in Ableton beats. */
  beats: number;
  /** The clip covering the spot, if one does. */
  clipId?: string;
  /** Why a lane the track doesn't have still did something, for the caller to
   * warn once the rest of the call has landed. */
  missingTakeLane?: string;
}

/**
 * Read a position path. Nothing is written here: a position Live can't resolve
 * has to fail before select touches anything, like every other target.
 * @param position - The spot the path named, or undefined for other paths
 * @returns The spot and the clip on it, or undefined when there was no position
 */
export function resolveArrangementPosition(
  position: CompleteArrangementPosition | undefined,
): ArrangementPositionTargets | undefined {
  if (position == null) {
    return undefined;
  }

  const { beats, clip } = arrangementPositionTarget(position, "path");

  return {
    beats,
    clipId: clip?.id,
    missingTakeLane: missingTakeLaneReason(position),
  };
}

/**
 * Move the arrangement start marker, where the next play begins. Not
 * `current_song_time`: that jumps playback itself, which navigating shouldn't.
 * @param beats - The spot, in Ableton beats
 */
export function applyArrangementStart(beats: number): void {
  LiveAPI.from(livePath.liveSet).set("start_time", beats);
}

// --- Helpers below main exports ---

/**
 * Why a lane that isn't there is worth saying something about. The spot on the
 * timeline is the point of the call and a missing lane never holds a clip, so
 * the call still does its part — but a caller expecting the take it named
 * would otherwise read the empty result as "nothing recorded there".
 * @param position - The spot the path named
 * @returns The reason, or undefined when the lane is there or wasn't named
 */
function missingTakeLaneReason(
  position: CompleteArrangementPosition,
): string | undefined {
  const { lane } = position;

  if (lane.kind !== "take-lane") {
    return undefined;
  }

  const lanePath = livePath.track(lane.trackIndex).takeLane(lane.laneIndex);

  if (LiveAPI.from(lanePath).exists()) {
    return undefined;
  }

  return (
    `take lane "l${lane.laneIndex}" does not exist on track "t${lane.trackIndex}"; ` +
    `selected the track and moved the start marker to ${position.position}`
  );
}
