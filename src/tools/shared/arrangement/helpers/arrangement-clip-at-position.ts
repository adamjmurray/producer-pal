// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding the clip a complete arrangement path names. `t0[5|1]` means the clip
// COVERING 5|1 on that lane, so dragging a clip in Live doesn't strand a path
// that used to reach it. A clip ending exactly at 5|1 loses a tie to one
// starting there (ADR-0037).

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { songPositionToBeats } from "#src/tools/shared/locator/song-position.ts";
import {
  type CompleteArrangementPosition,
  type ArrangementLane,
} from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { pathError } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { isTakeLaneClip } from "./take-lanes.ts";

/** Where a complete path lands, and what is there. */
export interface ArrangementPositionTarget {
  /** The position in Ableton beats. */
  beats: number;
  /** The clip covering it, or null when none does. */
  clip: LiveAPI | null;
}

/**
 * The arrangement clip covering a complete path's position.
 * @param path - A song position and the lane it sits on
 * @param paramName - The param the path came from, for its own errors
 * @returns The clip covering that position, or null when none does
 */
export function arrangementClipAtPosition(
  path: CompleteArrangementPosition,
  paramName: string,
): LiveAPI | null {
  return arrangementPositionTarget(path, paramName).clip;
}

/**
 * The same lookup, plus the beats the position resolved to — for a caller that
 * also needs the spot itself, not only the clip sitting on it.
 * @param path - A song position and the lane it sits on
 * @param paramName - The param the path came from, for its own errors
 * @returns The position in beats and the clip covering it
 */
export function arrangementPositionTarget(
  path: CompleteArrangementPosition,
  paramName: string,
): ArrangementPositionTarget {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const beats = positionBeats(liveSet, path, paramName);

  return {
    beats,
    clip:
      clipsOnLane(path.lane).find((clip) => coversPosition(clip, beats)) ??
      null,
  };
}

/**
 * The clips on one lane. A take lane answers with its own; the main lane is the
 * track's list minus anything sitting on a lane, so `t0[5|1]` can never match a
 * take at the same time however Live answers `arrangement_clips` on a track
 * that has lanes.
 *
 * The scan builds a LiveAPI per clip on the lane, so a caller looking several
 * things up holds the result rather than calling again.
 * @param lane - The lane the path named
 * @returns The clips on that lane, in Live's order
 */
export function clipsOnLane(lane: ArrangementLane): LiveAPI[] {
  if (lane.kind === "take-lane") {
    return LiveAPI.from(
      livePath.track(lane.trackIndex).takeLane(lane.laneIndex),
    ).getChildren("arrangement_clips");
  }

  return LiveAPI.from(livePath.track(lane.trackIndex))
    .getChildren("arrangement_clips")
    .filter((clip) => !isTakeLaneClip(clip));
}

/**
 * Whether a clip covers a position. A clip's end is exclusive, so a clip
 * ending exactly at the position loses to one starting there.
 * @param clip - The candidate arrangement clip
 * @param posBeats - The position in Ableton beats
 * @returns True when the clip's span contains the position
 */
function coversPosition(clip: LiveAPI, posBeats: number): boolean {
  const start = clip.getProperty("start_time") as number;

  if (Math.abs(start - posBeats) < SAME_TIME_EPSILON) {
    return true;
  }

  const end = clip.getProperty("end_time") as number;

  return start < posBeats && posBeats < end - SAME_TIME_EPSILON;
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
