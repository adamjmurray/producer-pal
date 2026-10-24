// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a write to the arrangement did to the clips that were already there, in
// words. Live overwrites, trims and splits them to make room and reports none
// of it; arrangement-lane-ledger.ts works out what changed, this says it.

import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { arrangementPositionPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { EPSILON } from "./arrangement-tiling-clips.ts";
import { type ArrangementTrack } from "./take-lanes.ts";

const OVERWROTE = "overwrote the clip at ";
const SHORTENED = "shortened the clip at ";
const SPLIT = "split the clip at ";
const EFFECT_START = [OVERWROTE, SHORTENED, SPLIT];

/** Where one clip began and ended. */
export interface ClipSpan {
  id: string;
  start: number;
  end: number;
}

/**
 * The lane a move's destination names, as a path coordinate.
 * @param target - The track and take lane the clip lands on
 * @returns The lane
 */
export function arrangementLaneOf(target: ArrangementTrack): ArrangementLane {
  const { trackIndex, takeLane } = target;

  return takeLane == null
    ? { kind: "track", trackIndex }
    : { kind: "take-lane", trackIndex, laneIndex: takeLane };
}

/**
 * What a write did to the clips that were already on a lane.
 * @param lane - The lane that was written to
 * @param before - The clips as they were, which the write didn't make
 * @param after - Those clips' spans now, by id; a clip that is gone has none
 * @param tails - New clips Live made that the write didn't (a split's tail)
 * @returns The effects, joined with "; ", or undefined when there were none
 */
export function describeWriteEffects(
  lane: ArrangementLane,
  before: readonly ClipSpan[],
  after: ReadonlyMap<string, ClipSpan>,
  tails: readonly ClipSpan[],
): string | undefined {
  return joinDetails(
    before.map((was) => effectOnClip(lane, was, after.get(was.id), tails)),
  );
}

/**
 * A detail without the sentences {@link describeWriteEffects} wrote, for a
 * caller that reports those itself.
 * @param detail - An entry's detail, or undefined
 * @returns What is left, or undefined when nothing is
 */
export function withoutWriteEffects(
  detail: string | undefined,
): string | undefined {
  return joinDetails(
    (detail?.split("; ") ?? []).filter(
      (part) => !EFFECT_START.some((start) => part.startsWith(start)),
    ),
  );
}

// --- Helpers below main exports ---

/**
 * What the write did to one clip that was already there.
 * @param lane - The lane it sat on
 * @param was - Its span before the write
 * @param now - Its span after, or undefined when it is gone
 * @param tails - New clips the write didn't make
 * @returns The effect, or undefined when the write left it alone
 */
function effectOnClip(
  lane: ArrangementLane,
  was: ClipSpan,
  now: ClipSpan | undefined,
  tails: readonly ClipSpan[],
): string | undefined {
  const inside = tails.filter(
    (clip) =>
      clip.start > was.start + EPSILON && clip.start < was.end - EPSILON,
  );

  if (now == null) {
    // A write starting exactly where a clip starts re-creates what is left of
    // it under a new id, ending where the old clip did.
    const rest = inside.find((clip) => Math.abs(clip.end - was.end) <= EPSILON);

    return rest == null
      ? `${OVERWROTE}${arrangementPositionPath(lane, was.start)}`
      : `${SHORTENED}${arrangementPositionPath(lane, rest.start)}`;
  }

  // Live keeps the head of a split clip on its id and gives the tail a new one.
  const tail = inside[0];

  if (tail != null) {
    return `${SPLIT}${arrangementPositionPath(lane, was.start)} into ${arrangementPositionPath(lane, now.start)} and ${arrangementPositionPath(lane, tail.start)}`;
  }

  if (
    Math.abs(now.start - was.start) > EPSILON ||
    Math.abs(now.end - was.end) > EPSILON
  ) {
    return `${SHORTENED}${arrangementPositionPath(lane, now.start)}`;
  }

  return undefined;
}
