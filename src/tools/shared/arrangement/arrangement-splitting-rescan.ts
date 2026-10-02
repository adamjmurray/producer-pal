// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding the pieces a split left behind. Kept apart from the splitting itself
// (arrangement-splitting.ts), which only records what it cut and where.

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
 * @returns The pieces each cut clip became, by the id it was cut at
 */
export function rescanSplitClips(
  splitClipRanges: Map<string, SplitClipRange>,
  clips: LiveAPI[],
  lanes: LaneView,
): Map<string, LiveAPI[]> {
  const freshByOldId = freshClipsByOldId(splitClipRanges, lanes);

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
 * @returns Fresh clips per original clip id, in track order
 */
function freshClipsByOldId(
  splitClipRanges: Map<string, SplitClipRange>,
  lanes: LaneView,
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

    for (const { id, start } of lanes.clips({ kind: "track", trackIndex })) {
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
