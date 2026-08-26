// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding the pieces a split left behind. Kept apart from the splitting itself
// (arrangement-splitting.ts), which only records what it cut and where.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { EPSILON } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";

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
 */
export function rescanSplitClips(
  splitClipRanges: Map<string, SplitClipRange>,
  clips: LiveAPI[],
): void {
  const freshByOldId = freshClipsByOldId(splitClipRanges);

  // Kept in the original range order: a splice can insert a clip whose id is
  // itself a later range's key (Live leaves the first piece on the original
  // id), so which index findIndex lands on depends on this order.
  for (const [oldClipId] of splitClipRanges) {
    const staleIndex = clips.findIndex((c) => c.id === oldClipId);

    if (staleIndex !== -1) {
      clips.splice(staleIndex, 1, ...(freshByOldId.get(oldClipId) ?? []));
    }
  }
}

/**
 * Collect the fresh pieces of every split clip, scanning each track once.
 *
 * The straightforward loop rescans the whole track per split clip, so cutting
 * one track at 32 points built every clip on it 32 times over. One pass per
 * track instead, bucketing each clip into whichever ranges contain it.
 *
 * @param splitClipRanges - Map of original clip IDs to their ranges
 * @returns Fresh clips per original clip id, in track order
 */
function freshClipsByOldId(
  splitClipRanges: Map<string, SplitClipRange>,
): Map<string, LiveAPI[]> {
  const rangesByTrack = new Map<number, [string, SplitClipRange][]>();

  for (const [oldClipId, range] of splitClipRanges) {
    const forTrack = rangesByTrack.get(range.trackIndex);

    if (forTrack) forTrack.push([oldClipId, range]);
    else rangesByTrack.set(range.trackIndex, [[oldClipId, range]]);
  }

  const freshByOldId = new Map<string, LiveAPI[]>();

  for (const [trackIndex, ranges] of rangesByTrack) {
    for (const [oldClipId] of ranges) freshByOldId.set(oldClipId, []);

    const track = LiveAPI.from(livePath.track(trackIndex));

    for (const clipId of track.getChildIds("arrangement_clips")) {
      const clip = LiveAPI.from(clipId);
      const clipStart = clip.getProperty("start_time") as number;

      for (const [oldClipId, range] of ranges) {
        if (
          clipStart >= range.startTime - EPSILON &&
          clipStart < range.endTime - EPSILON
        ) {
          (freshByOldId.get(oldClipId) as LiveAPI[]).push(clip);
        }
      }
    }
  }

  return freshByOldId;
}
