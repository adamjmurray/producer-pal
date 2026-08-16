// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  isTakeLaneClip,
  isTakeLaneRequested,
  normalizeTakeLaneTarget,
  takeLaneKey,
  type ArrangementTrack,
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
import {
  copyMidiClipToTakeLane,
  resolveDuplicateTakeLanes,
} from "./duplicate-take-lane-helpers.ts";
import {
  resolveArrangementPositions,
  resolveDestinationTargets,
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
 * @param takeLane - Hidden alias for the toPath `l` segment
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
  takeLane: number | string | undefined,
  takeLaneName: string | undefined,
  context: Partial<ToolContext>,
): Promise<object[]> {
  if (destinations.destination === "session") {
    // A session slot can't name a lane, so nothing here has one to honor.
    return duplicateClipToSlots(destinations.slots, object, id, name, color);
  }

  return await duplicateClipToArrangementPositions(
    destinations.arrangementTargets,
    object,
    id,
    name,
    color,
    arrangementStart,
    locator,
    arrangementLength,
    takeLane,
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
 * Copies a clip into the arrangement at each destination/position pair. A
 * destination naming a take lane is re-created on the lane (lanes have no
 * duplicate API); the rest go through Live's own arrangement duplicate.
 * @param targets - Destinations, or empty for the source's own track
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param name - Base name for duplicated clips
 * @param color - Color for duplicated clips (cycles if comma-separated)
 * @param arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param locator - Arrangement locator ID(s) or name(s) for position
 * @param arrangementLength - Duration in bar|beat format
 * @param takeLane - Hidden alias for the toPath `l` segment
 * @param takeLaneName - Name for a take lane newly created by this call
 * @param context - Context object with holdingAreaStartBeats
 * @returns Array of result objects
 */
async function duplicateClipToArrangementPositions(
  targets: ArrangementTrack[],
  object: LiveAPI,
  id: string,
  name: string | undefined,
  color: string | undefined,
  arrangementStart: string | undefined,
  locator: string | undefined,
  arrangementLength: string | undefined,
  takeLane: number | string | undefined,
  takeLaneName: string | undefined,
  context: Partial<ToolContext>,
): Promise<object[]> {
  // The alias folds on after resolution, because an omitted toPath means the
  // source clip's own track — which only exists as a destination once resolved.
  const destTargets = applyTakeLaneAlias(
    resolveDestinationTargets(object, targets),
    takeLane,
  );
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
  const copies = Math.max(destTargets.length, positionsInBeats.length);
  const targetTracks = cycle(destTargets, copies);
  const targetPositions = cycle(positionsInBeats, copies);

  // Lanes are permanent (Live has no delete), so resolve every one up front:
  // a capacity error partway through would strand the lanes already created.
  const lanes = resolveDuplicateTakeLanes(
    object,
    id,
    targetTracks,
    takeLaneName,
  );

  if (lanes == null) return [];

  if (lanes.size > 0 && arrangementLength != null) {
    console.warn(
      "duplicate: arrangementLength ignored for take-lane duplication (the copy uses the source clip's length)",
    );
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
          targetTracks.slice(i).map((entry) => entry.trackIndex),
        ),
      )
    ) {
      break;
    }

    const result = await duplicateOneCopy({
      target: targetTracks[i] as ArrangementTrack,
      startBeats: targetPositions[i] as number,
      lanes,
      object,
      id,
      name: getNameForIndex(name, i, parsedNames),
      color: getColorForIndex(color, i, parsedColors),
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
      context,
    });

    if (result != null) createdObjects.push(result);
  }

  return createdObjects;
}

/**
 * Folds the `takeLane` alias onto the destinations. It names one lane for the
 * whole call, so a toPath that already named its own lane wins — the alias is a
 * fallback for a caller that didn't use the segment.
 * @param targets - Resolved arrangement destinations
 * @param takeLane - The raw takeLane param
 * @returns The destinations, with the alias applied where a lane was unnamed
 */
function applyTakeLaneAlias(
  targets: ArrangementTrack[],
  takeLane: number | string | undefined,
): ArrangementTrack[] {
  if (!isTakeLaneRequested(takeLane)) return targets;

  if (targets.some((target) => target.takeLane != null)) {
    console.warn(
      'duplicate: takeLane ignored — "toPath" already names the take lane',
    );

    return targets;
  }

  const target = normalizeTakeLaneTarget(takeLane);

  return targets.map((entry) => ({ ...entry, takeLane: target }));
}

interface CopyOptions {
  target: ArrangementTrack;
  startBeats: number;
  lanes: Map<string, LiveAPI>;
  object: LiveAPI;
  id: string;
  name: string | undefined;
  color: string | undefined;
  arrangementLength: string | undefined;
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  context: Partial<ToolContext>;
}

/**
 * Makes one arrangement copy, on a take lane or the main lane.
 * @param options - Everything the copy needs
 * @returns The created clip info, or null when the copy was skipped
 */
async function duplicateOneCopy(options: CopyOptions): Promise<object | null> {
  const { target, startBeats, lanes, object, id } = options;

  if (target.takeLane != null) {
    const lane = lanes.get(takeLaneKey(target.trackIndex, target.takeLane));

    // A rejected source (audio, for now) warned once during lane resolution.
    if (lane == null) return null;

    try {
      return copyMidiClipToTakeLane(
        object,
        lane,
        startBeats,
        options.name,
        options.color,
      );
    } catch (error) {
      console.warn(
        `duplicate: failed to create take-lane clip at beat ${startBeats}: ${errorMessage(error)}`,
      );

      return null;
    }
  }

  // Main-lane destination with a take-lane source: Track.duplicate_clip_to_arrangement
  // behavior is unverified for take-lane source IDs (see take-lane-helpers.ts
  // header — Track-scoped APIs silently no-op on take-lane clips). Warn and skip
  // until promote-via-recreate is implemented as a follow-up.
  if (isTakeLaneClip(object)) {
    console.warn(
      `duplicate: source clip "${id}" is on a take lane; promoting to the main lane is not yet supported`,
    );

    return null;
  }

  return await duplicateClipToArrangement(
    id,
    startBeats,
    target.trackIndex,
    options.name,
    options.color,
    options.arrangementLength,
    options.songTimeSigNumerator,
    options.songTimeSigDenominator,
    options.context,
  );
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
