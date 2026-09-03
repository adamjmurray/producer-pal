// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  isTakeLaneClip,
  isTakeLaneRequested,
  normalizeTakeLaneTarget,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import {
  claimLabels,
  labelColor,
  labelName,
  type CopyLabels,
} from "../sources/duplicate-label-helpers.ts";
import { type ClipDestinations } from "./duplicate-destination-helpers.ts";
import {
  destinationTracks,
  duplicateOneCopy,
} from "./duplicate-clip-copy-helpers.ts";
import {
  copySpanBeats,
  planCopies,
  sourceLastOrder,
} from "./duplicate-clip-order-helpers.ts";
import { duplicateClipToSlots } from "./duplicate-clip-slot-helpers.ts";
import { type UnreachedDestination } from "../sources/duplicate-position-helpers.ts";
import {
  canRecreateClip,
  recreatedClipLosses,
} from "#src/tools/shared/clip/recreate-clip.ts";
import {
  labelDuplicateDestinations,
  noBudgetForCopies,
  stopMidFanOut,
} from "./duplicate-clip-deadline-helpers.ts";
import {
  resolveDuplicateTakeLanes,
  type ResolvedDuplicateLane,
} from "./duplicate-take-lane-helpers.ts";
import {
  resolveArrangementPositions,
  resolveDestinationTargets,
} from "../duplicate-validation-helpers.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Duplicates a clip to its resolved destinations
 * @param destinations - Where the copies go (clip slots or arrangement tracks)
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param labels - The call's names and colors
 * @param arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param locator - Arrangement locator ID(s) or name(s) for position
 * @param arrangementLength - Duration in bar|beat format
 * @param takeLane - Hidden alias for the toPath `l` segment
 * @param takeLaneName - Name for a take lane newly created by this call
 * @param context - Per-request context
 * @returns Array of result objects
 */
export async function duplicateClipWithPositions(
  destinations: ClipDestinations,
  object: LiveAPI,
  id: string,
  labels: CopyLabels,
  arrangementStart: string | undefined,
  locator: string | undefined,
  arrangementLength: string | undefined,
  takeLane: number | string | undefined,
  takeLaneName: string | undefined,
  context: Partial<ToolContext>,
): Promise<object[]> {
  if (destinations.destination === "session") {
    // A clip slot can't name a lane, so nothing here has one to honor.
    return duplicateClipToSlots(destinations.slots, object, id, labels);
  }

  return await duplicateClipToArrangementPositions(
    destinations.arrangementTargets,
    object,
    id,
    labels,
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
 * Copies a clip into the arrangement at each destination/position pair. A
 * destination naming a take lane is re-created on the lane (lanes have no
 * duplicate API); the rest go through Live's own arrangement duplicate.
 * @param targets - Destinations, or empty for the source's own track
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param labels - The call's names and colors
 * @param arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param locator - Arrangement locator ID(s) or name(s) for position
 * @param arrangementLength - Duration in bar|beat format
 * @param takeLane - Hidden alias for the toPath `l` segment
 * @param takeLaneName - Name for a take lane newly created by this call
 * @param context - Per-request context
 * @returns Array of result objects
 */
async function duplicateClipToArrangementPositions(
  targets: (ArrangementTrack | null)[],
  object: LiveAPI,
  id: string,
  labels: CopyLabels,
  arrangementStart: string | undefined,
  locator: string | undefined,
  arrangementLength: string | undefined,
  takeLane: number | string | undefined,
  takeLaneName: string | undefined,
  context: Partial<ToolContext>,
): Promise<object[]> {
  // The alias folds on after resolution, because an omitted toPath means the
  // source clip's own track — which only exists as a destination once resolved.
  const requested = applyTakeLaneAlias(
    resolveDestinationTargets(object, targets),
    takeLane,
  );

  // Only reachable once every named destination was skipped: an omitted toPath
  // resolves to the source's own track. Nowhere left to copy to.
  if (requested.every((target) => target == null)) return [];

  const { songTimeSigNumerator, songTimeSigDenominator, positionsInBeats } =
    resolveSongPositions(arrangementStart, locator);

  const {
    copies,
    targets: targetTracks,
    positions: targetPositions,
    requestIndices,
  } = planCopies(requested, positionsInBeats);

  // Nothing below can undo a lane, so check the budget before making any: out
  // of time here means permanent empty lanes and not one clip on them.
  if (
    noBudgetForCopies(
      targetTracks,
      targetPositions,
      songTimeSigNumerator,
      songTimeSigDenominator,
      context.deadline,
    )
  ) {
    return [];
  }

  const tracks = destinationTracks(targetTracks);

  // Lanes are permanent (Live has no delete), so resolve every one up front:
  // a capacity error partway through would strand the lanes already created.
  const lanes = resolveDuplicateTakeLanes(
    object,
    targetTracks,
    takeLaneName,
    tracks,
  );

  // Labelled after the lanes exist, so a stop names the lane it created rather
  // than the "l+" that made it — re-running "l+" would append another one.
  const destinations = labelDuplicateDestinations(
    targetTracks,
    targetPositions,
    lanes,
  );

  const canPromote = warnRecreatedCopyLimits(
    object,
    targetTracks,
    arrangementLength,
    lanes,
  );

  claimLabels(labels, copies);

  // Results keep the order the destinations were asked for, even though the
  // copies are made in another one.
  const order = sourceLastOrder(
    object,
    targetTracks,
    targetPositions,
    copySpanBeats(
      object,
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
    ),
  );
  const results: (object | null)[] = targetTracks.map(() => null);
  // A destination that was attempted and skipped is in neither the slice ahead
  // nor the landed tally, so without this it drops out of the report entirely.
  const skipped: UnreachedDestination[] = [];

  for (let done = 0; done < order.length; done++) {
    const i = order[done] as number; // bounded by the loop
    const requestIndex = requestIndices[i] as number; // one per copy

    // Each copy can tile a long span, so the budget can run out mid-list.
    if (
      stopMidFanOut({
        skipped,
        unreached: order
          .slice(done)
          .map((index) => destinations[index] as UnreachedDestination),
        results,
        total: targetTracks.length,
        songTimeSigNumerator,
        songTimeSigDenominator,
        deadline: context.deadline,
      })
    ) {
      break;
    }

    const result = await duplicateOneCopy({
      tracks,
      target: targetTracks[i] as ArrangementTrack,
      startBeats: targetPositions[i] as number,
      lanes,
      canPromote,
      object,
      id,
      name: labelName(labels, requestIndex),
      color: labelColor(labels, requestIndex),
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
      context,
    });

    if (result != null) {
      results[i] = result;
    } else {
      skipped.push(destinations[i] as UnreachedDestination);
    }
  }

  return results.filter((result) => result != null);
}

/**
 * Reads the song meter and resolves the positions the copies land on.
 * @param arrangementStart - Comma-separated bar|beat positions
 * @param locator - Arrangement locator ID(s) or name(s) for position
 * @returns The song time signature and one position per entry, in Ableton beats
 */
function resolveSongPositions(
  arrangementStart: string | undefined,
  locator: string | undefined,
): {
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  positionsInBeats: number[];
} {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  return {
    songTimeSigNumerator,
    songTimeSigDenominator,
    // Positions come from a locator or bar|beat (both comma-separated for
    // multiple); shared with scene duplication.
    positionsInBeats: resolveArrangementPositions(
      liveSet,
      arrangementStart,
      locator,
      songTimeSigNumerator,
      songTimeSigDenominator,
    ),
  };
}

/**
 * Warns once per call about what re-creating a copy costs, and says whether a
 * take-lane source may be re-created on the main lane.
 *
 * Per call, not per copy: a mixed toPath like "t1,t1/l0" would otherwise repeat
 * every warning for every position.
 * @param object - The source clip
 * @param targetTracks - Destination per copy
 * @param arrangementLength - The raw arrangementLength param
 * @param lanes - Take lanes resolved for this call
 * @returns Whether the source can be promoted to the main lane
 */
function warnRecreatedCopyLimits(
  object: LiveAPI,
  targetTracks: ArrangementTrack[],
  arrangementLength: string | undefined,
  lanes: Map<string, ResolvedDuplicateLane>,
): boolean {
  // A take-lane source going to the main lane is re-created there too, for the
  // same reason a lane destination is: Live's arrangement duplicate can't do it.
  const promotes =
    isTakeLaneClip(object) && targetTracks.some((t) => t.takeLane == null);
  const canPromote = promotes && canRecreateClip(object);

  if ((lanes.size > 0 || canPromote) && arrangementLength != null) {
    console.warn(
      "duplicate: arrangementLength ignored for the re-created copies (they use the source clip's length)",
    );
  }

  if (canPromote) {
    const losses = recreatedClipLosses(object);

    console.warn(
      `duplicate: clip ${targetLabel(object)} was promoted to the main lane by re-creating it` +
        (losses ? ` (${losses})` : ""),
    );
  } else if (promotes) {
    console.warn(
      `duplicate: promoting to the main lane re-creates the clip, so audio clip ${targetLabel(object)} with no sample file can't be promoted off its take lane; drag it in Live's UI`,
    );
  }

  return canPromote;
}

/**
 * Folds the `takeLane` alias onto the destinations. It names one lane for the
 * whole call, so a toPath that already named its own lane wins — the alias is a
 * fallback for a caller that didn't use the segment.
 * @param targets - Resolved arrangement destinations, null where unusable
 * @param takeLane - The raw takeLane param
 * @returns The destinations, with the alias applied where a lane was unnamed
 */
function applyTakeLaneAlias(
  targets: (ArrangementTrack | null)[],
  takeLane: number | string | undefined,
): (ArrangementTrack | null)[] {
  if (!isTakeLaneRequested(takeLane)) return targets;

  // A destination this call can't use is null and names no lane, so it can't
  // block the alias for the ones around it.
  if (targets.some((target) => target?.takeLane != null)) {
    console.warn(
      'duplicate: takeLane ignored — "toPath" already names the take lane',
    );

    return targets;
  }

  const target = normalizeTakeLaneTarget(takeLane);

  return targets.map((entry) =>
    entry == null ? null : { ...entry, takeLane: target },
  );
}
