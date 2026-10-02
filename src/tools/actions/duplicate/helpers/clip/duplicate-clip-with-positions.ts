// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  aliasTakeLane,
  isTakeLaneClip,
  isTakeLaneRequested,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  claimLabels,
  labelColor,
  labelLength,
  labelName,
  type CopyLabels,
} from "../sources/copy-labels.ts";
import { type ClipDestinations } from "./clip-destinations.ts";
import { copyLedger } from "./overwrites/copy-overwrites.ts";
import { destinationTracks, duplicateOneCopy } from "./duplicate-one-copy.ts";
import { copySpanBeats, planCopies, sourceLastOrder } from "./copy-plan.ts";
import { duplicateClipToSlots } from "./duplicate-clip-slot.ts";
import { type UnreachedDestination } from "../sources/scene-arrangement-positions.ts";
import { canRecreateClip } from "#src/tools/shared/clip/recreate-clip.ts";
import {
  clearedWithoutCopy,
  entriesPerDestination,
  labelDuplicateDestinations,
  refusedCopy,
} from "./copy-entries.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  resolveDuplicateTakeLanes,
  type ResolvedDuplicateLane,
} from "./duplicate-take-lanes.ts";
import {
  arrangementPositionToBeats,
  resolveArrangementPositions,
  resolveDestinationTargets,
} from "../duplicate-destinations.ts";

/**
 * Duplicates a clip to its resolved destinations
 * @param destinations - Where the copies go (clip slots or arrangement tracks)
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param labels - The call's names and colors
 * @param arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param takeLane - Hidden alias for the toPath `l` segment
 * @param takeLaneName - Deprecated: name for a lane this call creates
 * @param context - Per-request context
 * @param ledger - The call's arrangement lanes, shared by every copy
 * @returns Array of result objects
 */
export async function duplicateClipWithPositions(
  destinations: ClipDestinations,
  object: LiveAPI,
  id: string,
  labels: CopyLabels,
  arrangementStart: string | undefined,
  takeLane: number | string | undefined,
  takeLaneName: string | undefined,
  context: Partial<ToolContext>,
  ledger: LaneLedger = copyLedger(),
): Promise<object[]> {
  if (destinations.destination === "session") {
    // A clip slot can't name a lane, so nothing here has one to honor.
    return duplicateClipToSlots(destinations.slots, object, labels);
  }

  return await duplicateClipToArrangementPositions(
    destinations,
    object,
    id,
    labels,
    arrangementStart,
    takeLane,
    takeLaneName,
    context,
    ledger,
  );
}

// --- Helpers below main exports ---

/**
 * Copies a clip into the arrangement at each destination/position pair. A
 * destination naming a take lane is re-created on the lane (lanes have no
 * duplicate API); the rest go through Live's own arrangement duplicate.
 * @param destinations - Where the copies go, and the positions their own
 *   `[...]` named
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param labels - The call's names and colors
 * @param arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param takeLane - Hidden alias for the toPath `l` segment
 * @param takeLaneName - Deprecated: name for a lane this call creates
 * @param context - Per-request context
 * @param ledger - The call's arrangement lanes, shared by every copy
 * @returns Array of result objects
 */
async function duplicateClipToArrangementPositions(
  destinations: ClipDestinations,
  object: LiveAPI,
  id: string,
  labels: CopyLabels,
  arrangementStart: string | undefined,
  takeLane: number | string | undefined,
  takeLaneName: string | undefined,
  context: Partial<ToolContext>,
  ledger: LaneLedger,
): Promise<object[]> {
  // The alias folds on after resolution, because an omitted toPath means the
  // source clip's own track — which only exists as a destination once resolved.
  const resolved = resolveDestinationTargets(
    object,
    destinations.arrangementTargets,
  );
  const requested = applyTakeLaneAlias(resolved.destinations, takeLane);

  const { songTimeSigNumerator, songTimeSigDenominator, positionsInBeats } =
    resolveSongPositions(arrangementStart, destinations);

  const {
    copies,
    targets: targetTracks,
    positions: targetPositions,
    requestIndices,
    requestedTargets,
    requestedPositions,
  } = planCopies(requested, positionsInBeats);

  // Before any lane or copy: neither can be undone, so a label list that
  // doesn't match the copies, or a length that won't parse, refuses the call.
  claimLabels(labels, copies);

  const perDestination = {
    requestIndices,
    copies,
    refusals: resolved.refusals,
    positions: requestedPositions,
    arrangementTargets: destinations.arrangementTargets,
    arrangementRefusals: destinations.arrangementRefusals,
    resolvedTargets: requestedTargets,
    songTimeSigNumerator,
    songTimeSigDenominator,
  };

  // Nothing below can undo a lane, so check the budget before making any: out
  // of time here means permanent empty lanes and not one clip on them. Every
  // destination still answers, so a lone one comes back as the error.
  if (isDeadlineExceeded(context.deadline ?? null)) {
    return entriesPerDestination({ ...perDestination, results: [] });
  }

  const tracks = destinationTracks(targetTracks);

  // Lanes are permanent (Live has no delete), so resolve every one up front:
  // a capacity error partway through would strand the lanes already created.
  const { lanes, refusals: laneRefusals } = resolveDuplicateTakeLanes(
    object,
    targetTracks,
    takeLaneName,
    tracks,
  );

  const labelled = labelDuplicateDestinations(targetTracks, targetPositions);

  const canPromote = canPromoteSource(object, targetTracks);
  // Both re-create routes rebuild the clip from its sample, so a source without
  // one can't take either. Read once: every destination's entry says it.
  const noSample = canRecreateClip(object)
    ? null
    : "it's an audio clip with no sample file; drag it in Live's UI";

  const results = await makeCopies({
    copy: {
      tracks,
      lanes,
      laneRefusals,
      canPromote,
      noSample,
      object,
      id,
      labels,
      songTimeSigNumerator,
      songTimeSigDenominator,
      context,
      ledger,
    },
    targetTracks,
    targetPositions,
    requestIndices,
    labelled,
  });

  return entriesPerDestination({ ...perDestination, results });
}

/** What every copy in one call shares. */
interface SharedCopyOptions {
  tracks: Map<number, LiveAPI>;
  lanes: Map<string, ResolvedDuplicateLane>;
  laneRefusals: Map<string, string>;
  canPromote: boolean;
  noSample: string | null;
  object: LiveAPI;
  id: string;
  labels: CopyLabels;
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  context: Partial<ToolContext>;
  ledger: LaneLedger;
}

interface MakeCopiesArgs {
  copy: SharedCopyOptions;
  targetTracks: ArrangementTrack[];
  targetPositions: number[];
  /** The requested destination each copy belongs to */
  requestIndices: number[];
  /** Each copy's destination, labelled for its skip entry */
  labelled: UnreachedDestination[];
}

/**
 * Make the copies, in an order that keeps the source clip whole for as long as
 * possible, and report what each destination got.
 * @param args - What every copy shares, and the destinations to make them at
 * @param args.copy - What every copy in this call shares
 * @param args.targetTracks - Destination per copy
 * @param args.targetPositions - Start position per copy, in Ableton beats
 * @param args.requestIndices - The requested destination each copy belongs to
 * @param args.labelled - Each copy's destination, labelled for its skip entry
 * @returns One entry per copy attempted, null where the deadline stopped it
 */
async function makeCopies({
  copy,
  targetTracks,
  targetPositions,
  requestIndices,
  labelled,
}: MakeCopiesArgs): Promise<(object | null)[]> {
  const { songTimeSigNumerator, songTimeSigDenominator, context } = copy;
  // Results keep the order the destinations were asked for, even though the
  // copies are made in another one.
  const lengths = requestIndices.map((index) =>
    labelLength(copy.labels, index),
  );
  const order = sourceLastOrder(
    copy.object,
    targetTracks,
    targetPositions,
    lengths.map((length) =>
      copySpanBeats(
        copy.object,
        length,
        songTimeSigNumerator,
        songTimeSigDenominator,
      ),
    ),
  );
  const results: (object | null)[] = targetTracks.map(() => null);

  for (let done = 0; done < order.length; done++) {
    const i = order[done] as number; // bounded by the loop
    const requestIndex = requestIndices[i] as number; // one per copy

    // Each copy can tile a long span, so the budget can run out mid-list. The
    // copies left stay null, and each gets its own entry.
    if (isDeadlineExceeded(context.deadline ?? null)) {
      break;
    }

    const attempt = await duplicateOneCopy({
      ...copy,
      target: targetTracks[i] as ArrangementTrack,
      startBeats: targetPositions[i] as number,
      name: labelName(copy.labels, requestIndex),
      color: labelColor(copy.labels, requestIndex),
      arrangementLength: lengths[i],
    });

    if (attempt.copy != null) {
      results[i] = attempt.copy;

      continue;
    }

    // Live declined the copy after its landing cleared clips: the Set changed,
    // so the entry says so without `ok: false`, and it counts as landed.
    if (attempt.cleared != null) {
      results[i] = clearedWithoutCopy(
        labelled[i] as UnreachedDestination,
        { songTimeSigNumerator, songTimeSigDenominator },
        `${attempt.refused}; ${attempt.cleared}`,
      );

      continue;
    }

    // The destination keeps its place in the result, saying no copy landed on
    // it.
    results[i] = refusedCopy(
      labelled[i] as UnreachedDestination,
      { songTimeSigNumerator, songTimeSigDenominator },
      attempt.refused,
    );
  }

  return results;
}

/**
 * Reads the song meter and resolves the positions the copies land on — from the
 * `[...]` coordinates in toPath when it carried any, and from arrangementStart
 * otherwise. Only one of the two is ever in play: a call sending both is
 * refused before it starts.
 * @param arrangementStart - Comma-separated bar|beat positions
 * @param destinations - The destinations, with the position each one's own
 *   `[...]` named
 * @returns The song time signature and one position per entry, in Ableton beats
 */
function resolveSongPositions(
  arrangementStart: string | undefined,
  destinations: ClipDestinations,
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
  const pathPositions = destinations.arrangementPositions;
  const targets = destinations.arrangementTargets;
  // A source whose every entry is a refused clip slot lands nothing, so it
  // needs no position — and may have none, when the others came from toPath.
  const fromPath =
    pathPositions.some((position) => position != null) ||
    (targets.length > 0 && targets.every((target) => target == null));

  return {
    songTimeSigNumerator,
    songTimeSigDenominator,
    positionsInBeats: fromPath
      ? pathPositions.map((position) =>
          // A dropped entry — a clip slot in an arrangement toPath — keeps its
          // turn so names and colors stay aligned, and its position is never
          // read.
          position == null
            ? 0
            : arrangementPositionToBeats(
                position,
                songTimeSigNumerator,
                songTimeSigDenominator,
              ),
        )
      : // Comma-separated for multiple; shared with scene duplication.
        resolveArrangementPositions(
          arrangementStart,
          songTimeSigNumerator,
          songTimeSigDenominator,
        ),
  };
}

/**
 * Whether a take-lane source may be re-created on the main lane. A take-lane
 * source going there is re-created too, for the same reason a lane destination
 * is: Live's arrangement duplicate can't do it. A source with no sample can't
 * be promoted at all; each destination's own entry says so.
 * @param object - The source clip
 * @param targetTracks - Destination per copy
 * @returns Whether the source can be promoted to the main lane
 */
function canPromoteSource(
  object: LiveAPI,
  targetTracks: ArrangementTrack[],
): boolean {
  const promotes =
    isTakeLaneClip(object) && targetTracks.some((t) => t.takeLane == null);

  return promotes && canRecreateClip(object);
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
  // A destination this call can't use is null and names no lane, so it can't
  // block the alias for the ones around it.
  if (
    isTakeLaneRequested(takeLane) &&
    targets.some((target) => target?.takeLane != null)
  ) {
    console.warn('takeLane ignored — "toPath" already names the take lane');
  }

  return aliasTakeLane(targets, takeLane);
}
