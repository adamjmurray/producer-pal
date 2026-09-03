// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding the clip a complete arrangement path names. `t0[5|1]` means the clip
// that STARTS at 5|1 on that lane — a clip running through it from earlier is
// not it, and the path resolves to nothing (ADR-0037).

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  songPositionToBeats,
  type SongPositionLabels,
} from "#src/tools/shared/locator/song-position.ts";
import {
  type CompleteArrangementPosition,
  type ExistingArrangementLane,
} from "#src/tools/shared/validation/helpers/object-path-coord.ts";
import { isTakeLaneClip } from "./take-lane-helpers.ts";

/**
 * The arrangement clip starting at a complete path's position.
 * @param path - A song position and the lane it sits on
 * @param labels - How to name the position in its own errors
 * @returns The clip starting there, or null when none does
 */
export function arrangementClipAtPosition(
  path: CompleteArrangementPosition,
  labels: SongPositionLabels,
): LiveAPI | null {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const startBeats = songPositionToBeats(liveSet, path.position, {
    ...labels,
    timeSigNumerator: liveSet.getProperty("signature_numerator") as number,
    timeSigDenominator: liveSet.getProperty("signature_denominator") as number,
  });

  return (
    clipsOnLane(path.lane).find(
      (clip) =>
        Math.abs((clip.getProperty("start_time") as number) - startBeats) <
        SAME_TIME_EPSILON,
    ) ?? null
  );
}

// --- Helpers below main exports ---

/**
 * The clips on one lane. A take lane answers with its own; the main lane is the
 * track's list minus anything sitting on a lane, so `t0[5|1]` can never match a
 * take at the same time however Live answers `arrangement_clips` on a track
 * that has lanes.
 * @param lane - The lane the path named
 * @returns The clips on that lane, in Live's order
 */
function clipsOnLane(lane: ExistingArrangementLane): LiveAPI[] {
  if (lane.kind === "take-lane") {
    return LiveAPI.from(
      livePath.track(lane.trackIndex).takeLane(lane.laneIndex),
    ).getChildren("arrangement_clips");
  }

  return LiveAPI.from(livePath.track(lane.trackIndex))
    .getChildren("arrangement_clips")
    .filter((clip) => !isTakeLaneClip(clip));
}
