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
  getNameForIndex,
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import {
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "./duplicate-track-scene-helpers.ts";
import { resolveArrangementPositions } from "./duplicate-validation-helpers.ts";

/** The arrangement params a scene duplication reads. */
interface SceneArrangementParams {
  arrangementStart?: string;
  locator?: string;
  arrangementLength?: string;
  withoutClips?: boolean;
}

/**
 * Duplicates a scene to the arrangement at one or more positions.
 * Supports multiple positions from comma-separated locator IDs/names.
 * When a single position is given with count > 1, places copies sequentially.
 * @param object - Live API scene object
 * @param id - Scene ID
 * @param count - Number of copies (for sequential placement from a single position)
 * @param name - Base name for duplicated objects
 * @param params - Arrangement parameters (arrangementStart, locator, etc.)
 * @param context - Context object
 * @returns Array of result objects
 */
export async function duplicateSceneToArrangementAtPositions(
  object: LiveAPI,
  id: string,
  count: number,
  name: string | undefined,
  params: SceneArrangementParams,
  context: Partial<ToolContext>,
): Promise<object[]> {
  const { arrangementStart, locator, arrangementLength } = params;
  const withoutClips = params.withoutClips;

  const liveSet = LiveAPI.from(livePath.liveSet);
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  // Resolve all positions from bar|beat or locator(s)
  const positions = resolveArrangementPositions(
    liveSet,
    arrangementStart,
    locator,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  const sceneIndex = object.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(
      `duplicate failed: no scene index for id "${id}" (path="${object.path}")`,
    );
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
  const parsedNames = parseCommaSeparatedNames(name, allPositions.length);

  warnExtraNames(parsedNames, allPositions.length, "duplicate");

  for (let i = 0; i < allPositions.length; i++) {
    // A scene copy places a clip per track, so a few can eat the whole budget.
    if (
      stopForDeadline(context.deadline, () =>
        unreachedPositionsWarning(
          allPositions.slice(i),
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
      getNameForIndex(name, i, parsedNames),
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

/**
 * Warning text for a duplicate the deadline cut short, naming the arrangement
 * positions it never reached so the caller can re-run just those.
 *
 * @param remainingBeats - Positions still to do, in Ableton beats
 * @param done - Copies placed before time ran out
 * @param total - Copies the run set out to place
 * @param timeSigNumerator - Song time signature numerator
 * @param timeSigDenominator - Song time signature denominator
 * @returns The warning message
 */
export function unreachedPositionsWarning(
  remainingBeats: number[],
  done: number,
  total: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): string {
  const positions = remainingBeats
    .map((beats) =>
      abletonBeatsToBarBeat(beats, timeSigNumerator, timeSigDenominator),
    )
    .join(", ");

  return (
    `Ran out of time after duplicating ${done} of ${total}. ` +
    `Not duplicated: ${positions}. Re-run for those positions.`
  );
}
