// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { duplicateToArrangementTarget } from "#src/tools/shared/arrangement/arrangement-duplicate-target.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";
import {
  type ArrangementTrack,
  isTakeLaneClip,
  resolveTakeLane,
  type TakeLaneTarget,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  canRecreateClip,
  recreateClip,
  recreatedClipLosses,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { arrangementPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

interface PlaceMovedClipArgs {
  clip: LiveAPI;
  /** Destination track and lane, or null for the clip's own main lane. */
  destination: ArrangementTrack | null;
  destTrackIndex: number;
  targetBeats: number;
  isMidiClip: boolean;
  context: TilingContext;
}

/**
 * Put the moved clip at its destination, leaving the original for the caller to
 * delete or empty. Two ways in: Live's own arrangement duplicate, and a
 * re-create for everything the duplicate can't reach — a take-lane destination,
 * which has no duplicate API of its own, and a take-lane source, which
 * `duplicate_clip_to_arrangement` silently no-ops on.
 * @param args - Operation arguments
 * @param args.clip - The arrangement clip being moved
 * @param args.destination - Destination track and lane, or null for the clip's own lane
 * @param args.destTrackIndex - The track the clip lands on
 * @param args.targetBeats - Arrangement position to land at, in Ableton beats
 * @param args.isMidiClip - Whether the clip is MIDI
 * @param args.context - Context with silenceWavPath for audio clip operations
 * @returns The placed clip, or null when the move was refused (already warned)
 */
export function placeMovedClip({
  clip,
  destination,
  destTrackIndex,
  targetBeats,
  isMidiClip,
  context,
}: PlaceMovedClipArgs): LiveAPI | null {
  // Only for a named destination: an unnamed one is the clip's own track, which
  // already holds it. Live declines a type mismatch without reporting anything,
  // and the source is deleted right after, so check before destroying it.
  if (destination != null) {
    const blocker = clipCopyBlocker(isMidiClip, destTrackIndex);

    if (blocker != null) {
      console.warn(`clip ${targetLabel(clip)} was not moved: ${blocker}`);

      return null;
    }
  }

  const sourceIsOnTakeLane = isTakeLaneClip(clip);

  if (destination?.takeLane != null || sourceIsOnTakeLane) {
    // Audio is rebuilt from its sample, so a clip that has none can't be
    // re-created. Checked before resolveTakeLane, which creates permanent lanes.
    if (!canRecreateClip(clip)) {
      console.warn(
        `clip ${targetLabel(clip)} was not moved: it's an audio clip with no sample file; drag it in Live's UI`,
      );

      return null;
    }

    if (destination?.takeLane != null) {
      return recreateOnTakeLane(
        clip,
        destTrackIndex,
        destination.takeLane,
        targetBeats,
      );
    }

    return promoteToMainLane(clip, destTrackIndex, targetBeats);
  }

  return duplicateToArrangementTarget(
    LiveAPI.from(livePath.track(destTrackIndex)),
    clip.id,
    targetBeats,
    isMidiClip,
    context,
    clip,
  );
}

// --- Helpers below main exports ---

/**
 * Re-create the clip on a take lane. `duplicate_clip_to_arrangement` is
 * Track-scoped and a TakeLane has no duplicate of its own, so the clip is built
 * from its notes (or its sample), which drops what
 * {@link recreatedClipLosses} names.
 * @param clip - The arrangement clip being moved
 * @param destTrackIndex - The track whose lane the clip lands on
 * @param takeLane - Lane index, or "new" to append one
 * @param targetBeats - Arrangement position to land at, in Ableton beats
 * @returns The re-created clip, or null when the move was refused
 */
function recreateOnTakeLane(
  clip: LiveAPI,
  destTrackIndex: number,
  takeLane: TakeLaneTarget,
  targetBeats: number,
): LiveAPI | null {
  // Lanes are permanent — Live has no delete — but resolveTakeLane checks the
  // cap before creating any, so a refusal strands nothing.
  let laneIndex: number;
  let lane: LiveAPI;

  try {
    const resolved = resolveTakeLane(
      LiveAPI.from(livePath.track(destTrackIndex)),
      takeLane,
    );

    ({ lane, laneIndex } = resolved);
  } catch (error) {
    console.warn(
      `clip ${targetLabel(clip)} was not moved: ${errorMessage(error)}`,
    );

    return null;
  }

  return recreateForMove(clip, lane, targetBeats, destTrackIndex, laneIndex);
}

/**
 * Re-create a take-lane clip on the main lane. Live's duplicate silently
 * no-ops on a take-lane source, so a promote rebuilds the clip too.
 * @param clip - The take-lane clip being moved
 * @param destTrackIndex - The track whose main lane the clip lands on
 * @param targetBeats - Arrangement position to land at, in Ableton beats
 * @returns The re-created clip
 */
function promoteToMainLane(
  clip: LiveAPI,
  destTrackIndex: number,
  targetBeats: number,
): LiveAPI {
  return recreateForMove(
    clip,
    LiveAPI.from(livePath.track(destTrackIndex)),
    targetBeats,
    destTrackIndex,
    null,
  );
}

/**
 * Build the copy and report what re-creating it cost.
 * @param clip - The arrangement clip being moved
 * @param destination - The TakeLane, or the Track for the main lane
 * @param targetBeats - Arrangement position to land at, in Ableton beats
 * @param destTrackIndex - The track the clip lands on, for the message
 * @param laneIndex - The lane it lands on, or null for the main lane
 * @returns The re-created clip
 */
function recreateForMove(
  clip: LiveAPI,
  destination: LiveAPI,
  targetBeats: number,
  destTrackIndex: number,
  laneIndex: number | null,
): LiveAPI {
  // Read before the clip is touched: the re-create is what changes it.
  const losses = recreatedClipLosses(clip);
  const newClip = recreateClip(
    clip,
    destination,
    targetBeats,
    undefined,
    undefined,
  );

  console.warn(
    `clip ${targetLabel(clip)} was re-created on ${arrangementPath(destTrackIndex, laneIndex)}` +
      (losses ? ` (${losses})` : ""),
  );

  return newClip;
}
