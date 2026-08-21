// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ArrangementTrack } from "#src/tools/shared/arrangement/take-lane-helpers.ts";
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
 * A copy is in the way only when the span it clears — `spanBeats` forward from
 * its start — reaches the source, the same overlap test
 * `clearClipAtDuplicateTarget` uses. A copy that starts before the source and
 * stops short of it is not, and deferring it behind the one that truncates the
 * source is how it ends up made from the leftover.
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
  const sourceStart = source.getProperty("start_time") as number;
  const sourceEnd = source.getProperty("end_time") as number;
  // An unknown source track counts as every track, matching
  // clearClipAtDuplicateTarget: guessing wrong the other way loses content.
  const overwritesSource = (i: number): boolean =>
    (sourceTrackIndex == null ||
      (targets[i] as ArrangementTrack).trackIndex === sourceTrackIndex) &&
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

  if (arrangementLength == null) return sourceLength;

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
  // toPath and arrangementStart each set a copy count; the longer list wins and
  // the shorter one cycles, the way comma-separated colors do.
  const copies = Math.max(requested.length, positionsInBeats.length);
  const cycledTargets = cycle(requested, copies);
  const cycledPositions = cycle(positionsInBeats, copies);
  const requestIndices = cycledTargets.flatMap((target, i) =>
    target == null ? [] : [i],
  );

  return {
    copies,
    targets: requestIndices.map((i) => cycledTargets[i] as ArrangementTrack),
    positions: requestIndices.map((i) => cycledPositions[i] as number),
    requestIndices,
  };
}

/**
 * Repeats a list until it reaches the given length. Built by repeating the
 * whole list and trimming, so nothing has to promise the list is non-empty: an
 * empty one gives an empty result, which is what `length` would be anyway.
 * @param values - Values to cycle
 * @param length - Wanted length
 * @returns A list of that length
 */
function cycle<T>(values: T[], length: number): T[] {
  const repeats = Math.ceil(length / Math.max(values.length, 1));

  return Array.from({ length: repeats }, () => values)
    .flat()
    .slice(0, length);
}
