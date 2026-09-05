// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Position-based duplication: the scene loop, plus the warning both position
// loops (scenes here, clips in duplicate-clip-position-helpers) share when the
// request's deadline cuts them short.

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  claimLabels,
  labelName,
  type CopyLabels,
} from "./duplicate-label-helpers.ts";
import {
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "../duplicate-track-scene-helpers.ts";
import { resolveArrangementPositions } from "../duplicate-validation-helpers.ts";

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
  const { arrangementStart, arrangementLength } = params;
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
    throw new Error(`no scene index for id "${id}" (path="${object.path}")`);
  }

  // When single position + count > 1, expand to sequential positions
  const sceneLength = calculateSceneLength(sceneIndex);
  const allPositions =
    positions.length === 1 && count > 1
      ? Array.from(
          { length: count },
          // bounded by count, index always valid
          (_, i) => (positions[0] as number) + i * sceneLength,
        )
      : positions;

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
      withoutClips,
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
      context,
    );

    createdObjects.push(result);
  }

  return createdObjects;
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
