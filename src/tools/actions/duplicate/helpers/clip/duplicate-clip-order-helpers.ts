// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  isTakeLaneClip,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { pairValues } from "#src/tools/shared/validation/list-pairing.ts";
import { requireSameLength } from "#src/tools/shared/validation/list-lengths.ts";
import { parseArrangementLength } from "../duplicate-helpers.ts";

/**
 * Copy order that keeps the source clip whole for as long as possible.
 *
 * A copy landing on the source's own span overwrites it — Live's replace
 * behavior — so the source is shorter afterwards and every copy made after it
 * would be a copy of the leftover. Making those last means the rest of the
 * fan-out gets the whole clip, and the result no longer depends on the order
 * the destinations happened to be listed in.
 *
 * A copy is in the way only when it lands on the source's own lane and the span
 * it clears — `spanBeats` forward from its start — reaches the source, the same
 * overlap test `clearClipAtDuplicateTarget` uses. Two copies that miss each
 * other either way round must keep the order they were asked for: deferring one
 * behind the copy that truncates the source is how it ends up made from the
 * leftover.
 * @param source - The clip being copied
 * @param targets - Destination per copy
 * @param positions - Start position per copy, in Ableton beats
 * @param spanBeats - How far each copy clears forward from its start
 * @returns Copy indexes, in the order to make them
 */
export function sourceLastOrder(
  source: LiveAPI,
  targets: ArrangementTrack[],
  positions: number[],
  spanBeats: number,
): number[] {
  const indexes = positions.map((_, i) => i);

  // A session source is never in the way: nothing about it lives on the
  // arrangement timeline the copies are clearing.
  if (source.getProperty("is_arrangement_clip") !== 1) return indexes;

  const sourceTrackIndex = source.trackIndex;
  const sourceLane = source.takeLaneIndex;
  const sourceStart = source.getProperty("start_time") as number;
  const sourceEnd = source.getProperty("end_time") as number;
  // Every lane is written on its own, so only a copy landing on the source's
  // own lane can reach it — null is the main lane on both sides, so this
  // compares like with like. An "l+" matches nothing, which is right: the lane
  // it appends is empty.
  const sameLane = (i: number): boolean =>
    (targets[i] as ArrangementTrack).takeLane === sourceLane;
  // An unknown source track counts as every track and every lane, matching
  // clearClipAtDuplicateTarget: guessing wrong the other way loses content.
  const overwritesSource = (i: number): boolean =>
    (sourceTrackIndex == null ||
      ((targets[i] as ArrangementTrack).trackIndex === sourceTrackIndex &&
        sameLane(i))) &&
    (positions[i] as number) < sourceEnd &&
    (positions[i] as number) + spanBeats > sourceStart;

  return [
    ...indexes.filter((i) => !overwritesSource(i)),
    ...indexes.filter((i) => overwritesSource(i)),
  ];
}

/**
 * How far one copy clears forward from its start, in beats.
 *
 * An explicit `arrangementLength` is the span the copy fills; otherwise a copy
 * is the source's own length. A length that won't parse is not decided here:
 * the copies that use it throw on their own, and the ones that ignore it
 * (re-created lane copies) are the source's length anyway.
 *
 * A take-lane source ignores it outright, because every copy of one is
 * re-created — Live's arrangement duplicate handles neither direction — and a
 * re-created copy is always the source's own length. The tool warns that it is.
 * Ordering a lane copy against a span nothing writes is how it lands in the
 * safe bucket while really truncating the source.
 * @param source - The clip being copied
 * @param arrangementLength - The raw arrangementLength param
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @returns Span in beats
 */
export function copySpanBeats(
  source: LiveAPI,
  arrangementLength: string | undefined,
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
): number {
  const sourceLength =
    (source.getProperty("end_time") as number) -
    (source.getProperty("start_time") as number);

  if (arrangementLength == null || isTakeLaneClip(source)) return sourceLength;

  try {
    return parseArrangementLength(
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  } catch {
    return sourceLength;
  }
}

/** The copies a call makes, and where each one sits in what was requested. */
interface CopyPlan {
  /** How many copies were asked for, including any that can't be made. */
  copies: number;
  targets: ArrangementTrack[];
  positions: number[];
  /** Per copy, its place in the requested list — the name and color it takes. */
  requestIndices: number[];
}

/**
 * Pairs each requested destination with a position, dropping the copies that
 * can't be made but keeping the count and numbering of what was asked for.
 *
 * The count outlives the drop: name and color are counted per requested copy, so
 * renumbering here would slide every name after a gap onto the wrong clip — and
 * a 2-copy call collapsing to 1 stops splitting them at all, sending Live the
 * whole comma-separated string as one color.
 * @param requested - Resolved destinations, null where the copy can't be made
 * @param positionsInBeats - Start positions, in Ableton beats
 * @returns The copies to make, and how many were asked for
 */
export function planCopies(
  requested: (ArrangementTrack | null)[],
  positionsInBeats: number[],
): CopyPlan {
  // toPath and arrangementStart each set a copy count. One value covers every
  // copy; two real lists have to agree, and a call where they don't is refused
  // before any copy is made. The counts compared are the per-source ones — the
  // destinations were already shared out across the sources. Nothing cycles;
  // see `list-pairing.ts`.
  requireSameLength(
    { param: "toPath", count: requested.length },
    { param: "arrangementStart", count: positionsInBeats.length },
  );

  const copies = Math.max(requested.length, positionsInBeats.length);
  const targets = pairValues(requested, copies, {
    param: "toPath",
    noun: "destination",
    item: "copy",
    shortfall: "were not made",
  });
  const positions = pairValues(positionsInBeats, copies, {
    param: "arrangementStart",
    noun: "position",
    item: "copy",
    shortfall: "were not made",
  });
  const requestIndices = targets.flatMap((target, i) =>
    target == null || positions[i] == null ? [] : [i],
  );

  return {
    copies,
    targets: requestIndices.map((i) => targets[i] as ArrangementTrack),
    positions: requestIndices.map((i) => positions[i] as number),
    requestIndices,
  };
}
