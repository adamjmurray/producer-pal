// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";

/** A clip left in place until the clip that overwrites it has landed. */
export interface DeferredDeletion {
  /** The clip that was not moved. */
  clip: LiveAPI;
  /** The track it sits on, for the delete. */
  sourceTrack: LiveAPI;
  /** Its entry in the response, finished once its fate is known. */
  result: ClipResult;
}

/** The clips a call lands on one track at one position. */
export interface MoveGroup {
  trackIndex: number;
  count: number;
  /** Ids of the clips whose placement actually landed here. */
  landed: Set<string>;
  /** Clips waiting to see whether the overwrite really happens. */
  deferred: DeferredDeletion[];
}

/**
 * The group a moved clip belongs to: the track it lands on and the position it
 * lands at. There is no lane in the key. The non-survivor optimization leaves
 * every take-lane route out, but the tally does not, so a take-lane landing is
 * counted against the track's group and can name a stack that isn't one.
 * @param trackIndex - The track the clip lands on
 * @param startBeats - The position it lands at, in beats
 * @returns A key for that track and position
 */
export function moveGroupKey(trackIndex: number, startBeats: number): string {
  return `${trackIndex}@${startBeats}`;
}

/**
 * Count one clip against the group it lands in.
 * @param groups - Counts per group, added to
 * @param trackIndex - The track the clip lands on
 * @param startBeats - The position it lands at, in beats
 */
export function tallyMovedClip(
  groups: Map<string, MoveGroup>,
  trackIndex: number,
  startBeats: number,
): void {
  moveGroupFor(groups, trackIndex, startBeats).count++;
}

/**
 * Record that a clip's copy is confirmed to be sitting here. A tally is not the
 * same thing: a duplicate Live silently declined still cleared the range, so it
 * counts as a move but never as a landing.
 * @param groups - Counts per group, added to
 * @param trackIndex - The track the clip landed on
 * @param startBeats - The position it landed at, in beats
 * @param sourceClipId - Id of the clip that was moved here
 */
export function recordLandedClip(
  groups: Map<string, MoveGroup>,
  trackIndex: number,
  startBeats: number,
  sourceClipId: string,
): void {
  moveGroupFor(groups, trackIndex, startBeats).landed.add(sourceClipId);
}

/**
 * Hold a clip back from deletion until this group's overwrite is confirmed.
 * @param groups - Counts per group, added to
 * @param trackIndex - The track the clip was headed for
 * @param startBeats - The position it was headed for, in beats
 * @param pending - The clip, its track, and its entry in the response
 */
export function deferClipDeletion(
  groups: Map<string, MoveGroup>,
  trackIndex: number,
  startBeats: number,
  pending: DeferredDeletion,
): void {
  moveGroupFor(groups, trackIndex, startBeats).deferred.push(pending);
}

/**
 * Warn about clips this call stacked on top of each other.
 * @param groups - Counts per group, from tallyMovedClip
 */
export function emitArrangementWarnings(groups: Map<string, MoveGroup>): void {
  for (const { trackIndex, count } of groups.values()) {
    if (count > 1) {
      console.warn(
        `${count} clips on t${trackIndex} moved to the same position - later clips will overwrite earlier ones`,
      );
    }
  }
}

/**
 * The group for a track and position, created empty the first time.
 * @param groups - Counts per group
 * @param trackIndex - The track the clip lands on
 * @param startBeats - The position it lands at, in beats
 * @returns The group, now in the map
 */
function moveGroupFor(
  groups: Map<string, MoveGroup>,
  trackIndex: number,
  startBeats: number,
): MoveGroup {
  const key = moveGroupKey(trackIndex, startBeats);
  const group = groups.get(key) ?? {
    trackIndex,
    count: 0,
    landed: new Set<string>(),
    deferred: [],
  };

  groups.set(key, group);

  return group;
}
