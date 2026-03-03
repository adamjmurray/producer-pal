// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { resolveLocatorRefListToBeats } from "#src/tools/shared/locator/locator-helpers.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import {
  getNameForIndex,
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import {
  parseArrangementStartList,
  parseSlotList,
} from "#src/tools/shared/validation/position-parsing.ts";
import {
  duplicateClipSlot,
  duplicateClipToArrangement,
} from "./duplicate-helpers.ts";

/**
 * Duplicates a clip to explicit positions
 * @param destination - Destination for clip duplication (session or arrangement)
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param name - Base name for duplicated clips
 * @param color - Color for duplicated clips (cycles if comma-separated)
 * @param toSlot - Destination clip slot(s) in trackIndex/sceneIndex format
 * @param arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param locator - Arrangement locator ID(s) or name(s) for position
 * @param arrangementLength - Duration in bar|beat format
 * @param context - Context object with holdingAreaStartBeats
 * @returns Array of result objects
 */
export function duplicateClipWithPositions(
  destination: string | undefined,
  object: LiveAPI,
  id: string,
  name: string | undefined,
  color: string | undefined,
  toSlot: string | undefined,
  arrangementStart: string | undefined,
  locator: string | undefined,
  arrangementLength: string | undefined,
  context: Partial<ToolContext>,
): object[] {
  const createdObjects: object[] = [];

  if (destination === "session") {
    const slots = parseSlotList(toSlot);
    const trackIndex = object.trackIndex;
    const sourceSceneIndex = object.sceneIndex;

    if (trackIndex == null || sourceSceneIndex == null) {
      throw new Error(
        `unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="${id}" path="${object.path}") `,
      );
    }

    const parsedNames = parseCommaSeparatedNames(name, slots.length);
    const parsedColors = parseCommaSeparatedColors(color, slots.length);

    warnExtraNames(parsedNames, slots.length, "duplicate");

    for (let i = 0; i < slots.length; i++) {
      // bounded by slots.length
      const slot = slots[i] as { trackIndex: number; sceneIndex: number };
      const result = duplicateClipSlot(
        trackIndex,
        sourceSceneIndex,
        slot.trackIndex,
        slot.sceneIndex,
        getNameForIndex(name, i, parsedNames),
        getColorForIndex(color, i, parsedColors),
      );

      createdObjects.push(result);
    }
  } else {
    // Arrangement destination
    const liveSet = LiveAPI.from(livePath.liveSet);
    const songTimeSigNumerator = liveSet.getProperty(
      "signature_numerator",
    ) as number;
    const songTimeSigDenominator = liveSet.getProperty(
      "signature_denominator",
    ) as number;

    // Resolve positions from locator (single) or bar|beat (multiple)
    const positionsInBeats = resolveClipArrangementPositions(
      liveSet,
      arrangementStart,
      locator,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

    const parsedNames = parseCommaSeparatedNames(name, positionsInBeats.length);
    const parsedColors = parseCommaSeparatedColors(
      color,
      positionsInBeats.length,
    );

    warnExtraNames(parsedNames, positionsInBeats.length, "duplicate");

    for (let i = 0; i < positionsInBeats.length; i++) {
      const result = duplicateClipToArrangement(
        id,
        positionsInBeats[i] as number,
        getNameForIndex(name, i, parsedNames),
        getColorForIndex(color, i, parsedColors),
        arrangementLength,
        songTimeSigNumerator,
        songTimeSigDenominator,
        context,
      );

      createdObjects.push(result);
    }
  }

  return createdObjects;
}

/**
 * Resolves clip arrangement positions from bar|beat or locator
 * @param liveSet - The live_set LiveAPI object
 * @param arrangementStart - Comma-separated bar|beat positions
 * @param locator - Arrangement locator ID(s) or name(s) for position
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Array of positions in beats
 */
function resolveClipArrangementPositions(
  liveSet: LiveAPI,
  arrangementStart: string | undefined,
  locator: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number[] {
  // Locator-based: supports comma-separated for multiple positions
  if (locator != null) {
    return resolveLocatorRefListToBeats(liveSet, locator, "duplicate");
  }

  // Bar|beat positions: multiple positions supported
  const positions = parseArrangementStartList(arrangementStart);

  return positions.map((pos) =>
    barBeatToAbletonBeats(pos, timeSigNumerator, timeSigDenominator),
  );
}
