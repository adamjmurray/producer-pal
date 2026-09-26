// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import {
  type LandedSpan,
  nextLandingOrder,
  wholeLaneWrite,
} from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
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
  /** Where and when it landed, or null when its length couldn't be read. */
  span: LandedSpan | null;
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
  /**
   * What else the call wrote from here, which no entry's clip is a piece of: a
   * resize, or a landing of unknown length (see wholeLaneWrite).
   */
  cleared: LandedSpan[];
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
 * @param copy.id - The copy's id
 * @param copy.length - Its length as it landed, or null when unreadable
 */
export function recordLandedClip(
  groups: Map<string, MoveGroup>,
  landing: ArrangementTrack,
  startBeats: number,
  sourceClipId: string,
  copy: { id: string; length: number | null },
): void {
  const group = moveGroupFor(groups, landing, startBeats);
  const lane = arrangementLaneOf(landing);

  if (copy.length == null) {
    group.landed.set(sourceClipId, { id: copy.id, span: null });
    group.cleared.push(wholeLaneWrite(lane));

    return;
  }

  group.landed.set(sourceClipId, {
    id: copy.id,
    span: {
      lane,
      start: startBeats,
      end: startBeats + copy.length,
      order: nextLandingOrder(),
    },
  });
}

/**
 * Record a placement that failed but may have left a clip behind, as a partial
 * re-create does. No entry names that clip, so no earlier landing may claim it.
 * @param groups - Counts per group, added to
 * @param landing - The track and lane it was headed for
 * @param startBeats - The position it was headed for, in beats
 * @param length - The moved clip's length, or null when unreadable
 */
export function recordFailedLanding(
  groups: Map<string, MoveGroup>,
  landing: ArrangementTrack,
  startBeats: number,
  length: number | null,
): void {
  const lane = arrangementLaneOf(landing);

  moveGroupFor(groups, landing, startBeats).cleared.push(
    length == null
      ? wholeLaneWrite(lane)
      : {
          lane,
          start: startBeats,
          end: startBeats + length,
          order: nextLandingOrder(),
        },
  );
}

/**
 * Where each landed copy landed, and when.
 * @param groups - Counts per group
 * @returns Each copy's span, by the id its entry reported
 */
export function landedSpans(
  groups: ReadonlyMap<string, MoveGroup>,
): Map<string, LandedSpan> {
  const spans = new Map<string, LandedSpan>();

  for (const group of groups.values()) {
    for (const { id, span } of group.landed.values()) {
      if (span != null) {
        spans.set(id, span);
      }
    }
  }

  return spans;
}

/**
 * Record what a resize is about to write: between the clip's end and its new
 * end, where any tiles or temp clips go. Not the clip's own span, or a clip
 * resized to its own length and then front-cut could never claim its rest.
 * Call it just before the resize. It belongs to no entry's clip, so it only
 * keeps earlier landings from claiming a piece there.
 * @param groups - Counts per group, added to
 * @param clip - The clip about to be resized
 * @param lengthBeats - The length it is resized to, in beats
 */
export function recordResize(
  groups: Map<string, MoveGroup>,
  clip: LiveAPI,
  lengthBeats: number,
): void {
  const { trackIndex } = clip;

  if (trackIndex == null) {
    return;
  }

  const landing = { trackIndex, takeLane: clip.takeLaneIndex };
  const lane = arrangementLaneOf(landing);
  const start = clip.getProperty("start_time");
  const end = clip.getProperty("end_time");

  if (typeof start !== "number" || typeof end !== "number") {
    moveGroupFor(groups, landing, 0).cleared.push(wholeLaneWrite(lane));

    return;
  }

  const newEnd = start + lengthBeats;

  moveGroupFor(groups, landing, start).cleared.push({
    lane,
    start: Math.min(end, newEnd),
    end: Math.max(end, newEnd),
    order: nextLandingOrder(),
  });
}

/**
 * Every span the call wrote, whoever's clip it holds.
 * @param groups - Counts per group
 * @returns The landings' spans and everything else written
 */
export function writtenSpans(
  groups: ReadonlyMap<string, MoveGroup>,
): LandedSpan[] {
  return [...groups.values()].flatMap((group) => [
    ...[...group.landed.values()].flatMap(({ span }) => span ?? []),
    ...group.cleared,
  ]);
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
 * Whether this entry belongs to a clip the call held back. Read off the groups,
 * not the plan: a planned hold-back whose move was called off never got here.
 * @param groups - Counts per group
 * @param entry - The entry a clip's turn wrote first, if any
 * @returns True when a group is holding that clip back
 */
export function isHeldBackEntry(
  groups: Map<string, MoveGroup>,
  entry: ClipResult | undefined,
): boolean {
  return (
    entry != null &&
    [...groups.values()].some((group) =>
      group.deferred.some((held) => held.result === entry),
    )
  );
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
    cleared: [],
  };

  groups.set(key, group);

  return group;
}
