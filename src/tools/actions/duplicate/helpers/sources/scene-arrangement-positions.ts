// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Position-based duplication: the scene loop, plus the warning both position
// loops (scenes here, clips in duplicate-clip-with-positions) share when the
// request's deadline cuts them short.

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  claimLabels,
  labelColor,
  labelLength,
  labelName,
  type CopyLabels,
} from "./copy-labels.ts";
import {
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "./duplicate-scene.ts";
import { resolveArrangementPositions } from "../duplicate-destinations.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** The arrangement params a scene duplication reads. */
interface SceneArrangementParams {
  arrangementStart?: string;
  arrangementLength?: string;
  withoutClips?: boolean;
}

/**
 * Duplicates a scene to the arrangement at one or more positions, comma-separated.
 * When a single position is given with count > 1, places copies sequentially.
 * @param object - Live API scene object
 * @param id - Scene ID
 * @param count - Number of copies (for sequential placement from a single position)
 * @param labels - The call's names and colors
 * @param params - Arrangement parameters (arrangementStart, arrangementLength, etc.)
 * @param context - Context object
 * @returns Array of result objects
 */
export async function duplicateSceneToArrangementAtPositions(
  object: LiveAPI,
  id: string,
  count: number,
  labels: CopyLabels,
  params: SceneArrangementParams,
  context: Partial<ToolContext>,
): Promise<object[]> {
  const { arrangementStart } = params;
  const withoutClips = params.withoutClips;

  const liveSet = LiveAPI.from(livePath.liveSet);
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  const positions = resolveArrangementPositions(
    arrangementStart,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  const sceneIndex = object.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(`no scene index for ${targetLabel(object)}`);
  }

  // A lone position lays count copies end to end from it. A call naming a
  // position list already had count settled to 1 by sceneCopyCount.
  const sceneLength = calculateSceneLength(sceneIndex);
  let allPositions = positions;

  if (positions.length === 1 && count > 1) {
    allPositions = Array.from(
      { length: count },
      // bounded by count, index always valid
      (_, i) => (positions[0] as number) + i * sceneLength,
    );
  }

  const createdObjects: object[] = [];

  claimLabels(labels, allPositions.length);

  for (let i = 0; i < allPositions.length; i++) {
    // A scene copy places a clip per track, so a few can eat the whole budget.
    if (
      stopForDeadline(context.deadline, () =>
        unreachedPositionsWarning(
          allPositions.slice(i).map((beats) => ({ beats })),
          i,
          allPositions.length,
          songTimeSigNumerator,
          songTimeSigDenominator,
        ),
      )
    ) {
      break;
    }

    const result = await duplicateSceneToArrangement(
      id,
      allPositions[i] as number, // bounded by loop
      labelName(labels, i),
      labelColor(labels, i),
      withoutClips,
      labelLength(labels, i),
      songTimeSigNumerator,
      songTimeSigDenominator,
      context,
    );

    createdObjects.push(result);
  }

  return createdObjects;
}

/**
 * How many copies each scene source makes. A call naming several positions
 * already names one copy per position, so count adds nothing there — even when
 * those positions pair out one per scene — and is ignored with a warning.
 * @param type - What is being duplicated
 * @param dest - The call's settled destination
 * @param dest.arrangementStart - Every position the call named, in bar|beat
 * @param dest.onArrangement - Whether the copies land on the arrangement
 * @param count - The count param
 * @returns The count to copy each source at
 */
export function sceneCopyCount(
  type: string,
  dest: { arrangementStart?: string; onArrangement: boolean },
  count: number,
): number {
  if (
    type !== "scene" ||
    !dest.onArrangement ||
    count <= 1 ||
    targetEntries(dest.arrangementStart, "arrangementStart").length <= 1
  ) {
    return count;
  }

  console.warn(
    "count ignored for scenes: one copy per position — list more in toPath",
  );

  return 1;
}

/** One copy a deadline stop never reached. */
export interface UnreachedDestination {
  /** Where it was going, in Ableton beats */
  beats: number;
  /** Which destination, e.g. "t0" or "t0/l3". Omitted when there is only one. */
  label?: string;
}

/**
 * Warning text for a duplicate the deadline cut short, naming what it never
 * reached so the caller can re-run just that. A clip fan-out repeats the same
 * position across destinations, so those carry a label to tell them apart —
 * without it a caller re-runs destinations that already finished.
 *
 * @param remaining - The copies still to make
 * @param done - Copies placed before time ran out
 * @param total - Copies the run set out to place
 * @param timeSigNumerator - Song time signature numerator
 * @param timeSigDenominator - Song time signature denominator
 * @returns The warning message
 */
export function unreachedPositionsWarning(
  remaining: UnreachedDestination[],
  done: number,
  total: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): string {
  const positions = remaining
    .map(({ beats, label }) => {
      const barBeat = abletonBeatsToBarBeat(
        beats,
        timeSigNumerator,
        timeSigDenominator,
      );

      return label == null ? barBeat : `${label} ${barBeat}`;
    })
    .join(", ");

  return (
    `Ran out of time after duplicating ${done} of ${total}. ` +
    `Not duplicated: ${positions}. Re-run for those positions.`
  );
}
