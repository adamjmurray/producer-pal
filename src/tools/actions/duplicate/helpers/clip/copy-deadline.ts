// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a clip fan-out reports when the request's deadline cuts it short.

import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  takeLaneLabel,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import {
  unreachedPositionsWarning,
  type UnreachedDestination,
} from "../sources/scene-arrangement-positions.ts";

/**
 * Whether the request is out of time before it has made anything, warning about
 * every copy it won't make.
 *
 * Asked before any take lane is resolved: lanes are permanent, so stopping
 * after creating them leaves empty ones behind for good.
 * @param targets - Destination per copy
 * @param positions - Start position per copy, in Ableton beats
 * @param timeSigNumerator - Song time signature numerator
 * @param timeSigDenominator - Song time signature denominator
 * @param deadline - The request deadline from ToolContext
 * @returns true when nothing should be created
 */
export function noBudgetForCopies(
  targets: ArrangementTrack[],
  positions: number[],
  timeSigNumerator: number,
  timeSigDenominator: number,
  deadline: number | null | undefined,
): boolean {
  return stopForDeadline(deadline, () =>
    unreachedPositionsWarning(
      labelDuplicateDestinations(targets, positions),
      0,
      targets.length,
      timeSigNumerator,
      timeSigDenominator,
    ),
  );
}

/**
 * The copies a deadline stop would leave undone, labelled for a re-run.
 * @param targets - Destination per copy
 * @param positions - Start position per copy, in Ableton beats
 * @returns One labelled destination per copy
 */
export function labelDuplicateDestinations(
  targets: ArrangementTrack[],
  positions: number[],
): UnreachedDestination[] {
  return targets.map((target, i) => ({
    beats: positions[i] as number, // one position per destination
    label: takeLaneLabel(target),
  }));
}

interface StopMidFanOutArgs {
  /** Destinations that were attempted and produced no copy */
  skipped: UnreachedDestination[];
  /** Destinations the loop never got to */
  unreached: UnreachedDestination[];
  /** One entry per destination, null where no copy landed */
  results: (object | null)[];
  /** How many destinations were asked for */
  total: number;
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  deadline: number | null | undefined;
}

/**
 * Whether the request is out of time part-way through, warning about every
 * destination left without a copy.
 *
 * A destination that was attempted and skipped — a full take-lane track, an
 * audio source Live refuses — is in neither the landed tally nor the list still
 * ahead, so it has to be carried in or it drops out of the report entirely.
 * @param options - The two lists of destinations, the copies so far, and the
 *   song meter
 * @returns true when the rest of the fan-out should be abandoned
 */
export function stopMidFanOut(options: StopMidFanOutArgs): boolean {
  const { skipped, unreached, results, total } = options;
  const { songTimeSigNumerator, songTimeSigDenominator, deadline } = options;

  return stopForDeadline(deadline, () =>
    unreachedPositionsWarning(
      [...skipped, ...unreached],
      // Copies that actually landed, not iterations: one can be skipped and the
      // tally has to match what exists.
      results.filter((result) => result != null).length,
      total,
      songTimeSigNumerator,
      songTimeSigDenominator,
    ),
  );
}
