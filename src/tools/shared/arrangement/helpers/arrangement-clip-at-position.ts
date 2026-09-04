// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding the clip a complete arrangement path names. `t0[5|1]` means the clip
// that STARTS at 5|1 on that lane — a clip running through it from earlier is
// not it, and the path resolves to nothing (ADR-0037).

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { songPositionToBeats } from "#src/tools/shared/locator/song-position.ts";
import {
  type CompleteArrangementPosition,
  type ExistingArrangementLane,
} from "#src/tools/shared/validation/helpers/object-path-coord.ts";
import { pathError } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { isTakeLaneClip } from "./take-lane-helpers.ts";

/**
 * The arrangement clip starting at a complete path's position.
 * @param path - A song position and the lane it sits on
 * @param paramName - The param the path came from, for its own errors
 * @returns The clip starting there, or null when none does
 */
export function arrangementClipAtPosition(
  path: CompleteArrangementPosition,
  paramName: string,
): LiveAPI | null {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const startBeats = positionBeats(liveSet, path, paramName);

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
 * The position's beats, with a bad locator reported as a problem with the path
 * that carries it. The position doesn't frame its own reason: this names the
 * entry it came from.
 *
 * `reframed` below is load-bearing — don't drop it. The reason comes back as
 * the middle of `invalid <param> "<path>" - …`, which already names the param,
 * so the position's own "for <param>" suffix would say it twice.
 * @param liveSet - The live_set LiveAPI object
 * @param path - The complete arrangement path
 * @param paramName - The param the path came from, for errors
 * @returns The position in Ableton beats
 */
function positionBeats(
  liveSet: LiveAPI,
  path: CompleteArrangementPosition,
  paramName: string,
): number {
  try {
    return songPositionToBeats(liveSet, path.position, {
      paramName,
      reframed: true,
      timeSigNumerator: liveSet.getProperty("signature_numerator") as number,
      timeSigDenominator: liveSet.getProperty(
        "signature_denominator",
      ) as number,
    });
  } catch (error) {
    throw pathError(paramName, formatObjectPath(path), errorMessage(error));
  }
}

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
