// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  handleArrangementLengthOperation,
  shortensArrangementClip,
} from "#src/tools/clip/arrangement/arrangement-operations.ts";
import { type ClipIdResult } from "#src/tools/clip/arrangement/helpers/arrangement-length-changes.ts";
import {
  buildClipResultObject,
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import {
  arrangementLaneOf,
  arrangementWriteEffects,
  snapshotLane,
} from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";
import {
  type ArrangementTrack,
  isTakeLaneClip,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  markClipLanded,
  moveClipReasons,
  noteClipReason,
  refuseClipWork,
  type ClipReasons,
} from "../entries/clip-reasons.ts";
import {
  deferNonSurvivorDeletion,
  removeMovedSource,
} from "./update-clip-deferred-deletion.ts";
import { clipIsGone } from "../batch/buried-clips.ts";
import { placeMovedClip } from "./place-moved-clip.ts";
import {
  recordFailedLanding,
  recordLandedClip,
  recordResize,
  type MoveGroup,
} from "./update-clip-move-groups.ts";

interface HandleArrangementStartArgs {
  clip: LiveAPI;
  arrangementStartBeats: number | null;
  /** Where to move the clip, or null for its own track's main lane. */
  destination: ArrangementTrack | null;
  movedClipGroups: Map<string, MoveGroup>;
  isMidiClip: boolean;
  context: TilingContext;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
  isNonSurvivor?: boolean;
}

/**
 * Handle moving arrangement clips to a new position.
 *
 * Uses soft failure: on duplication failure, logs warning and returns original clip ID.
 * This allows update operations to continue processing other clips/parameters.
 * Compare to transform operations (shuffle/slice) which use hard failure (throw)
 * since they require all-or-nothing semantics.
 *
 * @param args - Operation arguments
 * @param args.clip - The clip to move
 * @param args.arrangementStartBeats - New position in beats, or null to keep the clip's own
 * @param args.destination - Destination track and lane, or null for the clip's own lane
 * @param args.movedClipGroups - Tally of clips landing on each lane and position
 * @param args.isMidiClip - Whether the clip is MIDI
 * @param args.context - Context with silenceWavPath for audio clip operations
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for the result entry
 * @param args.reasons - What each clip has to say beyond its result
 * @param args.isNonSurvivor - When true, leave the clip alone: a later, longer
 *   clip in this call is headed for the same place, and clearing it waits on
 *   that landing (see update-clip-deferred-deletion.ts)
 * @returns The new clip ID after move, original ID on failure, or null for non-survivors
 */
export function handleArrangementStartOperation({
  clip,
  arrangementStartBeats,
  destination,
  movedClipGroups,
  isMidiClip,
  context,
  updatedClips,
  noteResult,
  reasons,
  isNonSurvivor,
}: HandleArrangementStartArgs): string | null {
  // A session clip never gets here: position-operations.ts refuses it first.
  const sourceTrackIndex = clip.trackIndex;

  if (sourceTrackIndex == null) {
    refuseClipWork(
      reasons,
      clip.id,
      "not moved: could not determine its track",
    );

    return clip.id;
  }

  const sourceTrack = LiveAPI.from(livePath.track(sourceTrackIndex));
  const destTrackIndex = destination?.trackIndex ?? sourceTrackIndex;
  // Where the clip ends up: the named lane, or the main one — a move that names
  // no take lane promotes a take-lane clip onto the main lane.
  const landing = {
    trackIndex: destTrackIndex,
    takeLane: destination?.takeLane ?? null,
  };
  // Omitting arrangementStart with a destination means "same place, other
  // lane", so read the clip's own start before anything moves it.
  const targetBeats =
    arrangementStartBeats ?? (clip.getProperty("start_time") as number);

  // Non-survivor: don't move it, and don't clear it yet either. A later clip
  // in this call is headed here to overwrite it, and only that clip actually
  // landing settles its fate.
  if (isNonSurvivor) {
    deferNonSurvivorDeletion({
      clip,
      sourceTrack,
      landing,
      targetBeats,
      movedClipGroups,
      updatedClips,
      noteResult,
    });

    return null;
  }

  // The landing overwrites whatever is in its way — including a clip an
  // earlier target of this same call put there — so photograph the destination
  // lane and let this clip's entry say what it displaced.
  const laneBefore = snapshotLane(arrangementLaneOf(landing));
  const newClip = placeMovedClip({
    clip,
    destination,
    destTrackIndex,
    targetBeats,
    isMidiClip,
    context,
    reasons,
  });
  // The source describes itself: it is about to be cleared, and a move onto
  // its own lane trims it on the way.
  const displaced = arrangementWriteEffects(
    laneBefore,
    newClip == null ? [clip.id] : [clip.id, newClip.id],
  );

  if (displaced != null) {
    noteClipReason(reasons, clip.id, displaced);
  }

  // Null covers two cases, both already on the clip's entry: refused before
  // anything was touched, or a partial re-create. Either way the source is
  // left alone.
  if (newClip == null) {
    // A partial re-create may have left a clip there that no entry names.
    if (displaced != null) {
      recordFailedLanding(
        movedClipGroups,
        landing,
        targetBeats,
        landedLength(clip),
      );
    }

    return clip.id;
  }

  // Verify duplicate succeeded before deleting original
  if (!newClip.exists()) {
    refuseClipWork(
      reasons,
      clip.id,
      "not moved: Live made no copy at the destination, so the original was kept",
    );

    return clip.id;
  }

  // The copy is confirmed here, which is what releases any clip this call held
  // back for this lane and position.
  recordLandedClip(movedClipGroups, landing, targetBeats, clip.id, {
    id: newClip.id,
    length: landedLength(newClip),
  });

  // Clear the original to complete the move. A self-overlapping move already
  // deleted it. Check the path: a held clip's exists() stays true once it's gone.
  if (!clipIsGone(clip)) {
    const leftover = removeMovedSource(clip, sourceTrack);

    if (leftover != null) {
      noteClipReason(reasons, clip.id, leftover);
    }
  }

  // Return the new clip ID
  return newClip.id;
}

interface HandleArrangementOperationsArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementStartBeats?: number | null;
  arrangementLengthBeats?: number | null;
  /** Destination track and lane from toPath, or null to stay on its own lane. */
  destination?: ArrangementTrack | null;
  movedClipGroups: Map<string, MoveGroup>;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
  isNonSurvivor?: boolean;
}

/**
 * Handle arrangement start and length operations in correct order.
 *
 * A move copies the clip at its current length and clears that whole span at
 * the destination, so a main-lane clip being shortened is shortened first:
 * moving first would wipe neighbors the shortened clip no longer reaches.
 * Everything else moves first, so lengthening tiles from the new position
 * instead of over the clip's old neighbors.
 * @param args - Operation arguments
 * @param args.clip - The clip to operate on
 * @param args.isAudioClip - Whether the clip is audio
 * @param args.arrangementStartBeats - Target start position in beats
 * @param args.arrangementLengthBeats - Target length in beats
 * @param args.destination - Destination track and lane, or null for the clip's own lane
 * @param args.movedClipGroups - Tally of clips landing on each lane and position
 * @param args.context - Tool execution context
 * @param args.updatedClips - Array to collect updated clips
 * @param args.noteResult - Note update result for result
 * @param args.reasons - What each clip has to say beyond its result
 * @param args.isNonSurvivor - When true, clip is left for the deferred clear
 */
export function handleArrangementOperations(
  args: HandleArrangementOperationsArgs,
): void {
  const { clip, isAudioClip, arrangementLengthBeats } = args;
  const { movedClipGroups, context, updatedClips, noteResult, reasons } = args;
  // A destination alone is a move too: it keeps the clip's own start time and
  // changes only the lane it sits on.
  const moves = args.arrangementStartBeats != null || args.destination != null;

  if (
    moves &&
    arrangementLengthBeats != null &&
    shortensBeforeMove(args, arrangementLengthBeats)
  ) {
    shortenThenMove(args, arrangementLengthBeats);

    return;
  }

  let finalClipId: string | null = clip.id;
  let currentClip = clip;

  if (moves) {
    finalClipId = moveArrangementClip(args);

    // A non-survivor is not moved and already recorded its own entry.
    if (finalClipId == null) {
      return;
    }

    currentClip = LiveAPI.from(finalClipId);
  }

  let hasArrangementLengthResults = false;
  let finalNoteResult = noteResult;

  if (arrangementLengthBeats != null) {
    // A lengthen writes past the span the clip landed at.
    recordResize(movedClipGroups, currentClip, arrangementLengthBeats);

    let results: ClipIdResult[] = [];

    try {
      results = handleArrangementLengthOperation({
        clip: currentClip,
        isAudioClip,
        arrangementLengthBeats,
        context,
        reasons,
      });
    } catch (error) {
      // A landed move already deleted the source, so a throw would lose the
      // new clip's id. Keep the moved clip's entry and say what didn't happen.
      if (finalClipId === clip.id) {
        throw error;
      }

      noteClipReason(
        reasons,
        currentClip.id,
        `moved, but arrangementLength didn't finish: ${errorMessage(error)}`,
      );
    }

    // The resize runs on the clip the move left behind, which has a new id when
    // the move landed. What it says belongs to the clip the caller named.
    moveClipReasons(reasons, currentClip.id, clip.id);
    finalNoteResult = recountNotesAfterLengthChange(finalClipId, noteResult);

    if (results.length > 0) {
      // The resize landed, so a move refused beside it keeps a real entry.
      markClipLanded(reasons, clip.id);
      // The length helpers return ids only, and their first entry is always the
      // clip the notes were written to (any tiles follow it), so the note stats
      // go there. Each tile starts somewhere else, so each is asked its own
      // path rather than sharing the first one's.
      updatedClips.push(
        ...results.map((result, index) =>
          buildClipResultObject(
            result.id,
            index === 0 ? finalNoteResult : null,
            objectPathForApi(LiveAPI.from(result.id)),
          ),
        ),
      );
      hasArrangementLengthResults = true;
    }
  }

  if (!hasArrangementLengthResults) {
    updatedClips.push(
      buildClipResultObject(
        finalClipId,
        finalNoteResult,
        objectPathForApi(currentClip),
      ),
    );
  }
}

/**
 * Move the clip, reporting under the id the call found it at.
 * @param args - Operation arguments
 * @returns The moved clip's id, the original on failure, or null for a non-survivor
 */
function moveArrangementClip(
  args: HandleArrangementOperationsArgs,
): string | null {
  return handleArrangementStartOperation({
    clip: args.clip,
    arrangementStartBeats: args.arrangementStartBeats ?? null,
    destination: args.destination ?? null,
    movedClipGroups: args.movedClipGroups,
    isMidiClip: !args.isAudioClip,
    context: args.context as TilingContext,
    updatedClips: args.updatedClips,
    noteResult: args.noteResult,
    reasons: args.reasons,
    isNonSurvivor: args.isNonSurvivor,
  });
}

/**
 * Whether to shorten the clip where it sits before moving it. Main lane to main
 * lane only: take-lane clips refuse arrangementLength, and a move to or from a
 * take lane re-creates the clip rather than copying it.
 * @param args - Operation arguments
 * @param lengthBeats - Target length in beats
 * @returns True when the resize shortens a main-lane clip bound for a main lane
 */
function shortensBeforeMove(
  args: HandleArrangementOperationsArgs,
  lengthBeats: number,
): boolean {
  const { clip, destination, isNonSurvivor } = args;

  if (isNonSurvivor || destination?.takeLane != null || isTakeLaneClip(clip)) {
    return false;
  }

  return shortensArrangementClip(
    clip.getProperty("start_time") as number,
    clip.getProperty("end_time") as number,
    lengthBeats,
  );
}

/**
 * Shorten the clip where it sits, then move it. Shortening lays a temp clip
 * over the clip's own tail, so it touches nothing the clip doesn't already fill.
 * @param args - Operation arguments
 * @param lengthBeats - Target length in beats
 */
function shortenThenMove(
  args: HandleArrangementOperationsArgs,
  lengthBeats: number,
): void {
  const { clip, reasons } = args;

  recordResize(args.movedClipGroups, clip, lengthBeats);
  handleArrangementLengthOperation({
    clip,
    isAudioClip: args.isAudioClip,
    arrangementLengthBeats: lengthBeats,
    context: args.context,
    reasons,
  });
  // The resize landed, so a move refused after it keeps a real entry.
  markClipLanded(reasons, clip.id);

  const noteResult = recountNotesAfterLengthChange(clip.id, args.noteResult);
  let finalClipId: string;

  try {
    // Never null: a non-survivor doesn't shorten first.
    finalClipId = moveArrangementClip(args) as string;

    // A refused move already said why, but not that the clip is now shorter.
    if (finalClipId === clip.id) {
      noteClipReason(reasons, clip.id, "shortened in place");
    }
  } catch (error) {
    noteClipReason(
      reasons,
      clip.id,
      `shortened, but the move didn't finish: ${errorMessage(error)}`,
    );
    finalClipId = clip.id;
  }

  const finalClip = finalClipId === clip.id ? clip : LiveAPI.from(finalClipId);

  args.updatedClips.push(
    buildClipResultObject(finalClipId, noteResult, objectPathForApi(finalClip)),
  );
}

/**
 * A clip's arrangement length. For a copy, read the moment it lands, before a
 * later clip in this call can trim it.
 * @param clip - The copy the placement just made, or the clip being moved
 * @returns Its length in beats, or null when Live answered with neither edge
 */
function landedLength(clip: LiveAPI): number | null {
  const start = clip.getProperty("start_time") as number;
  const end = clip.getProperty("end_time") as number;

  return Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
}

/**
 * Recount a clip's notes after its length changed. The first count was taken
 * against the old [-length, 2*length] scan window, which misses notes written
 * past the old end — the whole point of writing notes and lengthening in one
 * call.
 * @param clipId - The clip the notes were written to
 * @param noteResult - The count from the note write, or null when none ran
 * @returns The note result with a refreshed count, or null
 */
function recountNotesAfterLengthChange(
  clipId: string,
  noteResult: NoteUpdateResult | null,
): NoteUpdateResult | null {
  if (noteResult == null) {
    return null;
  }

  return {
    ...noteResult,
    noteCount: getClipNoteCount(LiveAPI.from(clipId)),
  };
}
