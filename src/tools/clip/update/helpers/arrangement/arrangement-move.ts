// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { handleArrangementLengthOperation } from "#src/tools/clip/arrangement/arrangement-operations.ts";
import {
  buildClipResultObject,
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
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
import { placeMovedClip } from "./place-moved-clip.ts";
import {
  recordLandedClip,
  tallyMovedClip,
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
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (!isArrangementClip) {
    refuseClipWork(
      reasons,
      clip.id,
      "arrangementStart ignored: this is a session clip",
    );

    return clip.id;
  }

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

  const newClip = placeMovedClip({
    clip,
    destination,
    destTrackIndex,
    targetBeats,
    isMidiClip,
    context,
    movedClipGroups,
    reasons,
  });

  // Null covers two cases, both already on the clip's entry: refused before
  // anything was touched (nothing to tally), or a partial re-create that tallied
  // itself before returning here. Either way the source is left alone.
  if (newClip == null) {
    return clip.id;
  }

  // Counted against the lane and position the placement wrote to — the pair
  // the "same position" warning names. Counted after the placement ran, never
  // before: a refusal above wrote nothing, while a placement that ran and then
  // failed still counts, because it cleared the target range before the copy
  // that never appeared.
  tallyMovedClip(movedClipGroups, landing, targetBeats);

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
  recordLandedClip(movedClipGroups, landing, targetBeats, clip.id);

  // Clear the original to complete the move. For a self-overlapping move the
  // holding placement already trimmed it (or fully replaced it on a zero-offset
  // move), so guard with exists() — leaving a single clip at the new position.
  if (clip.exists()) {
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
 * Handle arrangement start and length operations in correct order
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
export function handleArrangementOperations({
  clip,
  isAudioClip,
  arrangementStartBeats,
  arrangementLengthBeats,
  destination,
  movedClipGroups,
  context,
  updatedClips,
  noteResult,
  reasons,
  isNonSurvivor,
}: HandleArrangementOperationsArgs): void {
  // Move FIRST so lengthening uses the new position
  let finalClipId: string | null = clip.id;
  let currentClip = clip;

  // A destination alone is a move too: it keeps the clip's own start time and
  // changes only the lane it sits on.
  if (arrangementStartBeats != null || destination != null) {
    finalClipId = handleArrangementStartOperation({
      clip,
      arrangementStartBeats: arrangementStartBeats ?? null,
      destination: destination ?? null,
      movedClipGroups,
      isMidiClip: !isAudioClip,
      context: context as TilingContext,
      updatedClips,
      noteResult,
      reasons,
      isNonSurvivor,
    });

    // A non-survivor is not moved and already recorded its own entry.
    if (finalClipId == null) {
      return;
    }

    currentClip = LiveAPI.from(finalClipId);
  }

  // Handle arrangementLength SECOND
  let hasArrangementLengthResults = false;
  let finalNoteResult = noteResult;

  if (arrangementLengthBeats != null) {
    const results = handleArrangementLengthOperation({
      clip: currentClip,
      isAudioClip,
      arrangementLengthBeats,
      context,
      reasons,
    });

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
