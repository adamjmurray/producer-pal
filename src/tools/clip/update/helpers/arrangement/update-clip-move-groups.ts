// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  takeLaneLabel,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";

/** A clip left in place until the clip that overwrites it has landed. */
export interface DeferredDeletion {
  /** The clip that was not moved. */
  clip: LiveAPI;
  /** The track it sits on, for the delete. */
  sourceTrack: LiveAPI;
  /** Its entry in the response, finished once its fate is known. */
  result: ClipResult;
}

/** The copy one clip's placement left here. */
export interface LandedClip {
  /** The copy Live made, which is the id that clip's entry reports. */
  id: string;
  /**
   * Its arrangement length as it landed, or null when nothing can be concluded
   * from it (unreadable, or the call resized it afterwards). See
   * batch/trimmed-landings.ts for what the length is for.
   */
  length: number | null;
}

/** The clips a call lands on one lane at one position. */
export interface MoveGroup {
  /** The track and lane they land on. */
  landing: ArrangementTrack;
  /** The position they land at, in beats. */
  startBeats: number;
  /** What each clip's placement landed here, by source id, in landing order. */
  landed: Map<string, LandedClip>;
  /** Clips waiting to see whether the overwrite really happens. */
  deferred: DeferredDeletion[];
}

/**
 * The group a moved clip belongs to: the lane it lands on and the position it
 * lands at. Take lanes are separate lanes, so clips landing on different ones
 * pass through each other and belong to different groups. Two onto one lane do
 * overwrite — a create truncates the clip already there — so a take-lane
 * landing is keyed by its lane, not left out of the tally.
 * @param landing - The track and lane the clip lands on
 * @param startBeats - The position it lands at, in beats
 * @returns A key for that lane and position
 */
export function moveGroupKey(
  landing: ArrangementTrack,
  startBeats: number,
): string {
  return `${takeLaneLabel(landing)}@${startBeats}`;
}

/**
 * Record that a clip's copy is confirmed to be sitting here. A tally is not the
 * same thing: a duplicate Live silently declined still cleared the range, so it
 * counts as a move but never as a landing.
 * @param groups - Counts per group, added to
 * @param landing - The track and lane the clip landed on
 * @param startBeats - The position it landed at, in beats
 * @param sourceClipId - Id of the clip that was moved here
 * @param copy - The copy it landed, as it was before anything trimmed it
 */
export function recordLandedClip(
  groups: Map<string, MoveGroup>,
  landing: ArrangementTrack,
  startBeats: number,
  sourceClipId: string,
  copy: LandedClip,
): void {
  moveGroupFor(groups, landing, startBeats).landed.set(sourceClipId, copy);
}

/**
 * Drop a landing's length, for a call that changed it after the copy landed.
 * Nothing else knows the new geometry, so the group is left to the read-back
 * rather than described from a length that is no longer true.
 * @param groups - Counts per group
 * @param sourceClipId - Id of the clip that was moved
 */
export function forgetLandedLength(
  groups: Map<string, MoveGroup>,
  sourceClipId: string,
): void {
  for (const group of groups.values()) {
    const landed = group.landed.get(sourceClipId);

    if (landed != null) {
      landed.length = null;
    }
  }
}

/**
 * Hold a clip back from deletion until this group's overwrite is confirmed.
 * @param groups - Counts per group, added to
 * @param landing - The track and lane the clip was headed for
 * @param startBeats - The position it was headed for, in beats
 * @param pending - The clip, its track, and its entry in the response
 */
export function deferClipDeletion(
  groups: Map<string, MoveGroup>,
  landing: ArrangementTrack,
  startBeats: number,
  pending: DeferredDeletion,
): void {
  moveGroupFor(groups, landing, startBeats).deferred.push(pending);
}

/**
 * The group for a lane and position, created empty the first time.
 * @param groups - Counts per group
 * @param landing - The track and lane the clip lands on
 * @param startBeats - The position it lands at, in beats
 * @returns The group, now in the map
 */
function moveGroupFor(
  groups: Map<string, MoveGroup>,
  landing: ArrangementTrack,
  startBeats: number,
): MoveGroup {
  const key = moveGroupKey(landing, startBeats);
  const group = groups.get(key) ?? {
    landing,
    startBeats,
    landed: new Map<string, LandedClip>(),
    deferred: [],
  };

  groups.set(key, group);

  return group;
}
