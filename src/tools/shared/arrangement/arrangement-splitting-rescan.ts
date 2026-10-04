// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The pieces of a split: how many a cut leaves, and finding them afterwards.
// Kept apart from the splitting itself (arrangement-splitting.ts), which only
// records what it cut and where.

import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { EPSILON } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";

/** The span one clip occupied before it was cut, and the track it was on. */
export interface SplitClipRange {
  trackIndex: number;
  startTime: number;
  endTime: number;
}

/**
 * Re-scan tracks to replace stale clip objects with fresh ones.
 * @param splitClipRanges - Map of original clip IDs to their ranges
 * @param clips - Array to update with fresh clips
 * @param lanes - The call's lanes, which know where every piece landed
 * @param trackFor - The track a caller already holds for an index, so the lane
 *   is read through it instead of resolving the track again
 * @returns The pieces each cut clip became, by the id it was cut at
 */
export function rescanSplitClips(
  splitClipRanges: Map<string, SplitClipRange>,
  clips: LiveAPI[],
  lanes: LaneView,
  trackFor?: (trackIndex: number) => LiveAPI | undefined,
): Map<string, LiveAPI[]> {
  const freshByOldId = freshClipsByOldId(splitClipRanges, lanes, trackFor);

  // Kept in the original range order: a splice can insert a clip whose id is
  // itself a later range's key (Live leaves the first piece on the original
  // id), so which index findIndex lands on depends on this order.
  for (const [oldClipId] of splitClipRanges) {
    const staleIndex = clips.findIndex((c) => c.id === oldClipId);

    if (staleIndex !== -1) {
      clips.splice(staleIndex, 1, ...(freshByOldId.get(oldClipId) ?? []));
    }
  }

  return freshByOldId;
}

/**
 * Collect the fresh pieces of every split clip, from the call's lane view. The
 * view already knows each clip's start, so only a clip that is a piece of some
 * cut is looked up at all. Bucketing each clip into whichever ranges contain it
 * keeps it to one pass over a track however many clips were cut on it.
 *
 * @param splitClipRanges - Map of original clip IDs to their ranges
 * @param lanes - The call's lanes
 * @param trackFor - The track a caller already holds for an index, if any
 * @returns Fresh clips per original clip id, in track order
 */
function freshClipsByOldId(
  splitClipRanges: Map<string, SplitClipRange>,
  lanes: LaneView,
  trackFor?: (trackIndex: number) => LiveAPI | undefined,
): Map<string, LiveAPI[]> {
  const rangesByTrack = new Map<number, [string, SplitClipRange][]>();

  for (const [oldClipId, range] of splitClipRanges) {
    const forTrack = rangesByTrack.get(range.trackIndex);

    if (forTrack) {
      forTrack.push([oldClipId, range]);
    } else {
      rangesByTrack.set(range.trackIndex, [[oldClipId, range]]);
    }
  }

  const freshByOldId = new Map<string, LiveAPI[]>();

  for (const [trackIndex, ranges] of rangesByTrack) {
    for (const [oldClipId] of ranges) {
      freshByOldId.set(oldClipId, []);
    }

    for (const { id, start } of lanes.clips(
      { kind: "track", trackIndex },
      trackFor?.(trackIndex),
    )) {
      for (const [oldClipId, range] of ranges) {
        if (
          start >= range.startTime - EPSILON &&
          start < range.endTime - EPSILON
        ) {
          (freshByOldId.get(oldClipId) as LiveAPI[]).push(
            LiveAPI.from(toLiveApiId(id)),
          );
        }
      }
    }
  }

  return freshByOldId;
}

/**
 * The split points that fall inside a clip, as offsets from its start.
 *
 * Song-timeline positions become offsets from the clip's start; the deprecated
 * `split` param already gives offsets. Everything below is clip-relative.
 *
 * The margin is EPSILON, not 0, and it is load-bearing: the trims are all
 * guarded by `> EPSILON`, so a point within EPSILON of either edge would let one
 * of them be skipped, and a skipped trim leaves a span the moves assume was
 * vacated still occupied. Those moves skip the overlap clear, so Live would
 * crash on the next duplicate. Keep the two thresholds equal. Such a point asks
 * for a zero-length segment anyway.
 * @param splitPoints - Parsed positions in beats, read per `mode`
 * @param mode - Whether positions are song-timeline or clip-relative
 * @param clipStart - Where the clip starts, in beats
 * @param clipLength - How long the clip is, in beats
 * @returns Each point inside the clip, with its place in `splitPoints`
 */
export function splitOffsetsInside(
  splitPoints: number[],
  mode: { origin: "song" | "clip" },
  clipStart: number,
  clipLength: number,
): Array<{ index: number; offset: number }> {
  return splitPoints
    .map((point, index) => ({
      index,
      offset: mode.origin === "song" ? point - clipStart : point,
    }))
    .filter(({ offset }) => offset > EPSILON && offset < clipLength - EPSILON);
}

/**
 * How many pieces a cut leaves of a clip: one more than the points inside it.
 * @param clip - The arrangement clip the call would cut
 * @param splitPoints - Parsed positions in beats, read per `mode`
 * @param mode - Whether positions are song-timeline or clip-relative
 * @returns The number of pieces, 1 when no point falls inside
 */
export function cutPieceCount(
  clip: LiveAPI,
  splitPoints: number[],
  mode: { origin: "song" | "clip" },
): number {
  const start = clip.getProperty("start_time") as number;
  const length = (clip.getProperty("end_time") as number) - start;

  return splitOffsetsInside(splitPoints, mode, start, length).length + 1;
}
