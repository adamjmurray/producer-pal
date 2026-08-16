// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  isTakeLaneClip,
  type TakeLaneTarget,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import {
  getNameForIndex,
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { type SlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { type ClipDestinations } from "./duplicate-destination-helpers.ts";
import { duplicateClipToArrangement } from "../duplicate-helpers.ts";
import { duplicateClipSlot } from "./duplicate-clip-slot-helpers.ts";
import { unreachedPositionsWarning } from "../duplicate-position-helpers.ts";
import { duplicateClipsToTakeLane } from "./duplicate-take-lane-helpers.ts";
import {
  resolveArrangementPositions,
  resolveDestinationTrackIndices,
} from "../duplicate-validation-helpers.ts";

/**
 * Duplicates a clip to its resolved destinations
 * @param destinations - Where the copies go (session slots or arrangement tracks)
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param name - Base name for duplicated clips
 * @param color - Color for duplicated clips (cycles if comma-separated)
 * @param arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param locator - Arrangement locator ID(s) or name(s) for position
 * @param arrangementLength - Duration in bar|beat format
 * @param takeLaneTarget - Normalized take lane target for arrangement clips, or null for main lane
 * @param takeLaneName - Name for a take lane newly created by this call
 * @param context - Context object with holdingAreaStartBeats
 * @returns Array of result objects
 */
export async function duplicateClipWithPositions(
  destinations: ClipDestinations,
  object: LiveAPI,
  id: string,
  name: string | undefined,
  color: string | undefined,
  arrangementStart: string | undefined,
  locator: string | undefined,
  arrangementLength: string | undefined,
  takeLaneTarget: TakeLaneTarget | null,
  takeLaneName: string | undefined,
  context: Partial<ToolContext>,
): Promise<object[]> {
  if (destinations.destination === "session") {
    // takeLane is normalized to null for session destinations in duplicate.ts
    // (warning emitted there before normalization, so a malformed takeLane on a
    // session duplicate warns instead of throwing).
    return duplicateClipToSlots(destinations.slots, object, id, name, color);
  }

  return await duplicateClipToArrangementPositions(
    destinations.trackIndices,
    object,
    id,
    name,
    color,
    arrangementStart,
    locator,
    arrangementLength,
    takeLaneTarget,
    takeLaneName,
    context,
  );
}

// --- Helpers below main exports ---

/**
 * Copies a session clip into session slots.
 * @param slots - Destination slots, in order
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param name - Base name for duplicated clips
 * @param color - Color for duplicated clips (cycles if comma-separated)
 * @returns Array of result objects
 */
function duplicateClipToSlots(
  slots: SlotPosition[],
  object: LiveAPI,
  id: string,
  name: string | undefined,
  color: string | undefined,
): object[] {
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

  // A copy Live declined warns and reports nothing, so the results only list
  // the copies that exist.
  return slots
    .map((slot, i) =>
      duplicateClipSlot(
        trackIndex,
        sourceSceneIndex,
        slot.trackIndex,
        slot.sceneIndex,
        getNameForIndex(name, i, parsedNames),
        getColorForIndex(color, i, parsedColors),
      ),
    )
    .filter((clipInfo) => clipInfo != null);
}

/**
 * Copies a clip into the arrangement at each track/position pair.
 * @param trackIndices - Destination tracks, or empty for the source's own track
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param name - Base name for duplicated clips
 * @param color - Color for duplicated clips (cycles if comma-separated)
 * @param arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param locator - Arrangement locator ID(s) or name(s) for position
 * @param arrangementLength - Duration in bar|beat format
 * @param takeLaneTarget - Normalized take lane target, or null for main lane
 * @param takeLaneName - Name for a take lane newly created by this call
 * @param context - Context object with holdingAreaStartBeats
 * @returns Array of result objects
 */
async function duplicateClipToArrangementPositions(
  trackIndices: number[],
  object: LiveAPI,
  id: string,
  name: string | undefined,
  color: string | undefined,
  arrangementStart: string | undefined,
  locator: string | undefined,
  arrangementLength: string | undefined,
  takeLaneTarget: TakeLaneTarget | null,
  takeLaneName: string | undefined,
  context: Partial<ToolContext>,
): Promise<object[]> {
  const destTracks = resolveDestinationTrackIndices(object, trackIndices);
  const liveSet = LiveAPI.from(livePath.liveSet);
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  // Resolve positions from locator or bar|beat (both comma-separated for
  // multiple); shared with scene duplication.
  const positionsInBeats = resolveArrangementPositions(
    liveSet,
    arrangementStart,
    locator,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // toPath and arrangementStart each set a copy count; the longer list wins and
  // the shorter one cycles, the way comma-separated colors do.
  const copies = Math.max(destTracks.length, positionsInBeats.length);
  const targetTracks = cycle(destTracks, copies);
  const targetPositions = cycle(positionsInBeats, copies);

  // Take lane targeting: re-create on the lane (no duplicate API for lanes)
  if (takeLaneTarget != null) {
    if (arrangementLength != null) {
      console.warn(
        "duplicate: arrangementLength ignored for take-lane duplication (the copy uses the source clip's length)",
      );
    }

    return duplicateClipsToTakeLane(
      object,
      id,
      targetTracks,
      targetPositions,
      name,
      color,
      takeLaneTarget,
      takeLaneName,
    );
  }

  // Main-lane destination with a take-lane source: Track.duplicate_clip_to_arrangement
  // behavior is unverified for take-lane source IDs (see take-lane-helpers.ts
  // header — Track-scoped APIs silently no-op on take-lane clips). Warn and skip
  // until promote-via-recreate is implemented as a follow-up.
  if (isTakeLaneClip(object)) {
    console.warn(
      `duplicate: source clip "${id}" is on a take lane; promoting to the main lane is not yet supported`,
    );

    return [];
  }

  const createdObjects: object[] = [];
  const parsedNames = parseCommaSeparatedNames(name, copies);
  const parsedColors = parseCommaSeparatedColors(color, copies);

  warnExtraNames(parsedNames, copies, "duplicate");

  for (let i = 0; i < copies; i++) {
    // Each copy can tile a long span, so the budget can run out mid-list.
    if (
      stopForDeadline(context.deadline, () =>
        unreachedPositionsWarning(
          targetPositions.slice(i),
          i,
          copies,
          songTimeSigNumerator,
          songTimeSigDenominator,
          targetTracks.slice(i),
        ),
      )
    ) {
      break;
    }

    const result = await duplicateClipToArrangement(
      id,
      targetPositions[i] as number,
      targetTracks[i],
      getNameForIndex(name, i, parsedNames),
      getColorForIndex(color, i, parsedColors),
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
 * Repeats a non-empty list until it reaches the given length.
 * @param values - Values to cycle
 * @param length - Wanted length
 * @returns A list of that length
 */
function cycle(values: number[], length: number): number[] {
  return Array.from({ length }, (_, i) => values[i % values.length] as number);
}
