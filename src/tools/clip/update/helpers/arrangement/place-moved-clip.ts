// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicateToArrangementTarget } from "#src/tools/shared/arrangement/arrangement-duplicate-target.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import {
  type ArrangementTrack,
  isTakeLaneClip,
  resolveTakeLane,
  type TakeLaneTarget,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  canRecreateClip,
  PartialRecreateError,
  recreateClip,
  recreatedClipLosses,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { arrangementPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  noteClipReason,
  refuseClipWork,
  type ClipReasons,
} from "../entries/clip-reasons.ts";
import { tallyMovedClip, type MoveGroup } from "./update-clip-move-groups.ts";

interface PlaceMovedClipArgs {
  clip: LiveAPI;
  /** Destination track and lane, or null for the clip's own main lane. */
  destination: ArrangementTrack | null;
  destTrackIndex: number;
  targetBeats: number;
  isMidiClip: boolean;
  context: TilingContext;
  /** Tally of clips landing on each lane and position. */
  movedClipGroups: Map<string, MoveGroup>;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
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
 * @param args.movedClipGroups - Tally of clips landing on each lane and position
 * @param args.reasons - What each clip has to say beyond its result
 * @returns The placed clip, or null when the move was refused or only partly
 *   landed (the clip's own entry says which; either way the source is untouched)
 */
export function placeMovedClip({
  clip,
  destination,
  destTrackIndex,
  targetBeats,
  isMidiClip,
  context,
  movedClipGroups,
  reasons,
}: PlaceMovedClipArgs): LiveAPI | null {
  // Only for a named destination: an unnamed one is the clip's own track, which
  // already holds it. Live declines a type mismatch without reporting anything,
  // and the source is deleted right after, so check before destroying it.
  if (destination != null) {
    const blocker = clipCopyBlocker(isMidiClip, destTrackIndex);

    if (blocker != null) {
      refuseClipWork(reasons, clip.id, `not moved: ${blocker}`);

      return null;
    }
  }

  const sourceIsOnTakeLane = isTakeLaneClip(clip);

  if (destination?.takeLane != null || sourceIsOnTakeLane) {
    // Audio is rebuilt from its sample, so a clip that has none can't be
    // re-created. Checked before resolveTakeLane, which creates permanent lanes.
    if (!canRecreateClip(clip)) {
      refuseClipWork(
        reasons,
        clip.id,
        "not moved: it's an audio clip with no sample file; drag it in Live's UI",
      );

      return null;
    }

    if (destination?.takeLane != null) {
      return recreateOnTakeLane(
        clip,
        destination,
        targetBeats,
        movedClipGroups,
        reasons,
      );
    }

    return promoteToMainLane(
      clip,
      destTrackIndex,
      targetBeats,
      movedClipGroups,
      reasons,
    );
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
 * @param destination - The lane the clip lands on
 * @param targetBeats - Arrangement position to land at, in Ableton beats
 * @param movedClipGroups - Tally of clips landing on each lane and position
 * @param reasons - What each clip has to say beyond its result
 * @returns The re-created clip, or null when the move was refused or only
 *   partly landed (either way, nothing further should touch the source)
 */
function recreateOnTakeLane(
  clip: LiveAPI,
  destination: ArrangementTrack,
  targetBeats: number,
  movedClipGroups: Map<string, MoveGroup>,
  reasons: ClipReasons,
): LiveAPI | null {
  const destTrackIndex = destination.trackIndex;
  const takeLane = destination.takeLane as TakeLaneTarget;

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
    refuseClipWork(reasons, clip.id, `not moved: ${errorMessage(error)}`);

    return null;
  }

  try {
    return recreateForMove(
      clip,
      lane,
      targetBeats,
      { trackIndex: destTrackIndex, takeLane: laneIndex },
      movedClipGroups,
      reasons,
    );
  } catch (error) {
    refuseClipWork(reasons, clip.id, `not moved: ${errorMessage(error)}`);

    return null;
  }
}

/**
 * Re-create a take-lane clip on the main lane. Live's duplicate silently
 * no-ops on a take-lane source, so a promote rebuilds the clip too.
 * @param clip - The take-lane clip being moved
 * @param destTrackIndex - The track whose main lane the clip lands on
 * @param targetBeats - Arrangement position to land at, in Ableton beats
 * @param movedClipGroups - Tally of clips landing on each lane and position
 * @param reasons - What each clip has to say beyond its result
 * @returns The re-created clip, or null when the move was refused or only
 *   partly landed (either way, nothing further should touch the source)
 */
function promoteToMainLane(
  clip: LiveAPI,
  destTrackIndex: number,
  targetBeats: number,
  movedClipGroups: Map<string, MoveGroup>,
  reasons: ClipReasons,
): LiveAPI | null {
  try {
    return recreateForMove(
      clip,
      LiveAPI.from(livePath.track(destTrackIndex)),
      targetBeats,
      { trackIndex: destTrackIndex, takeLane: null },
      movedClipGroups,
      reasons,
    );
  } catch (error) {
    refuseClipWork(reasons, clip.id, `not moved: ${errorMessage(error)}`);

    return null;
  }
}

/**
 * Build the copy and report what re-creating it cost.
 *
 * The exists() check is belt-and-braces: recreateClip's own create step already
 * throws rather than returning a clip that doesn't exist.
 *
 * A failure after the clip was created leaves a real, partial clip at the
 * destination ({@link PartialRecreateError}). It could have been the note write
 * or the color write, so neither clip is safe to touch: the partial clip and the
 * source are both left as they are. The position was cleared for it either way,
 * so the tally still counts it. Any other failure is the caller's try/catch to
 * report as a full refusal.
 * @param clip - The arrangement clip being moved
 * @param destination - The TakeLane, or the Track for the main lane
 * @param targetBeats - Arrangement position to land at, in Ableton beats
 * @param landing - The track and lane the clip lands on
 * @param movedClipGroups - Tally of clips landing on each lane and position
 * @param reasons - What each clip has to say beyond its result
 * @returns The re-created clip, or null when it only partly landed (the clip's
 *   own entry says so; the source is left in place either way)
 */
function recreateForMove(
  clip: LiveAPI,
  destination: LiveAPI,
  targetBeats: number,
  landing: ArrangementTrack,
  movedClipGroups: Map<string, MoveGroup>,
  reasons: ClipReasons,
): LiveAPI | null {
  const landingPath = arrangementPath(landing.trackIndex, landing.takeLane);
  // Read before the clip is touched: the re-create is what changes it.
  const losses = recreatedClipLosses(clip);

  try {
    const newClip = recreateClip(
      clip,
      destination,
      targetBeats,
      undefined,
      undefined,
    );

    if (newClip.exists()) {
      noteClipReason(
        reasons,
        clip.id,
        `re-created on ${landingPath}` + (losses ? ` (${losses})` : ""),
      );
    }

    return newClip;
  } catch (error) {
    if (error instanceof PartialRecreateError) {
      tallyMovedClip(movedClipGroups, landing, targetBeats);
      refuseClipWork(
        reasons,
        clip.id,
        `not moved: an incomplete clip was left on ${landingPath} (${error.message}); the original clip was kept`,
      );

      return null;
    }

    throw error;
  }
}
