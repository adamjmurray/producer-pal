// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One entry per destination a clip duplicate named, in the order it named them:
// the copy that landed, or why none did (ADR-0042).

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  takeLaneLabel,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import { skippedCopy } from "../minimal-clip-info.ts";
import { type DuplicateArrangementTarget } from "./clip-destinations.ts";
import { type UnreachedDestination } from "../sources/scene-arrangement-positions.ts";

/** The song meter a destination's position is spelled in. */
export interface CopyMeter {
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
}

export interface DestinationEntriesArgs {
  /** What each copy produced, by copy index */
  results: (object | null)[];
  /** The requested destination each copy belongs to */
  requestIndices: number[];
  /** How many destinations the call asked for */
  copies: number;
  /** Why each requested destination can't be used, where it can't */
  refusals: (string | null)[];
  /** Start position per requested destination, in Ableton beats */
  positions: (number | null)[];
  /** The destinations as toPath named them, before they were resolved */
  arrangementTargets: (DuplicateArrangementTarget | null)[];
  /** The entry each destination the arrangement can't use keeps */
  arrangementRefusals: (TargetSkip | null)[];
  /** The destinations as resolved, which fills in the track a path left out */
  resolvedTargets: (ArrangementTrack | null)[];
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
}

/**
 * One entry per destination the call named, in the order it named them: the copy
 * that landed, or the entry saying why none did (ADR-0042).
 * @param args - The copies made, and the destinations they were asked for
 * @returns The result entries, in request order
 */
export function entriesPerDestination(args: DestinationEntriesArgs): object[] {
  const { results, requestIndices, copies, refusals, positions } = args;
  const { arrangementTargets, arrangementRefusals, resolvedTargets } = args;
  const { songTimeSigNumerator, songTimeSigDenominator } = args;
  const byRequest = new Map<number, object | null>(
    requestIndices.map((request, copy) => [request, results[copy] ?? null]),
  );

  return Array.from({ length: copies }, (_unused, request) => {
    const made = byRequest.get(request);

    if (made != null) {
      return made;
    }

    // A destination the arrangement can't use — a clip slot — knows its own
    // address, since it never resolved to a track.
    const unusable = arrangementRefusals[request];

    if (unusable != null) {
      return unusable;
    }

    return refusedCopy(
      {
        beats: positions[request] ?? 0,
        label: destinationLabel(
          arrangementTargets[request],
          resolvedTargets[request],
        ),
      },
      { songTimeSigNumerator, songTimeSigDenominator },
      refusals[request] ?? missedCopyReason(byRequest.has(request)),
    );
  });
}

/**
 * Why a destination got no copy where nothing refused it outright: the call ran
 * out of time before reaching it, or it was never paired with a position.
 * @param reached - Whether the fan-out had a copy planned for it
 * @returns The reason for that destination's entry
 */
function missedCopyReason(reached: boolean): string {
  return reached
    ? "the request ran out of time; re-run for this destination"
    : "no position was paired with this destination";
}

/**
 * How a destination that got no copy is addressed: from the toPath entry that
 * named it, or from the resolved destination where the path left the track out.
 * @param target - The destination as toPath named it
 * @param resolved - The same destination resolved, if it resolved
 * @returns The lane part of the path
 */
function destinationLabel(
  target: DuplicateArrangementTarget | null | undefined,
  resolved: ArrangementTrack | null | undefined,
): string {
  const trackIndex = target?.trackIndex ?? resolved?.trackIndex;

  return trackIndex == null
    ? ""
    : takeLaneLabel({
        trackIndex,
        takeLane: target?.takeLane ?? resolved?.takeLane ?? null,
      });
}

/**
 * The entry a destination that got no copy keeps, addressed the way a copy that
 * landed there would have been.
 * @param destination - Where the copy was headed: the lane, and the position
 * @param meter - The song time signature, for spelling the position
 * @param meter.songTimeSigNumerator - Numerator
 * @param meter.songTimeSigDenominator - Denominator
 * @param reason - Why no copy landed there
 * @returns The skip entry
 */
export function refusedCopy(
  destination: UnreachedDestination,
  { songTimeSigNumerator, songTimeSigDenominator }: CopyMeter,
  reason: string,
): object {
  const position = abletonBeatsToBarBeat(
    destination.beats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  return skippedCopy(`${destination.label ?? ""}[${position}]`, reason);
}
