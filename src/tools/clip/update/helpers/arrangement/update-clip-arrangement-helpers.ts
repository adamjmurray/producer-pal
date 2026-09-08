// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { handleArrangementLengthOperation } from "#src/tools/clip/arrangement/arrangement-operations.ts";
import {
  buildClipResultObject,
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";
import { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import {
  objectPathForApi,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  deferNonSurvivorDeletion,
  removeMovedSource,
} from "./update-clip-deferred-deletion.ts";
import { placeMovedClip } from "./update-clip-lane-move-helpers.ts";
import {
  recordLandedClip,
  tallyMovedClip,
  type MoveGroup,
} from "./update-clip-move-groups.ts";

interface HandleArrangementStartArgs {
  clip: LiveAPI;
  arrangementStartBeats: number | null;
  /** Where to move the clip, or null to keep it on its own lane. */
  destination: ArrangementTrack | null;
  movedClipGroups: Map<string, MoveGroup>;
  isMidiClip: boolean;
  context: TilingContext;
  /** The lane an `l+` in this call appended, keyed by destination. */
  appendedLanes: Map<string, number>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
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
 * @param args.appendedLanes - The lane this call already appended, shared by every `l+`
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for the result entry
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
  appendedLanes,
  updatedClips,
  noteResult,
  isNonSurvivor,
}: HandleArrangementStartArgs): string | null {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (!isArrangementClip) {
    console.warn(
      `arrangementStart parameter ignored for session clip ${targetLabel(clip)}`,
    );

    return clip.id;
  }

  const sourceTrackIndex = clip.trackIndex;

  if (sourceTrackIndex == null) {
    console.warn(
      `could not determine trackIndex for clip ${targetLabel(clip)}`,
    );

    return clip.id;
  }

  const sourceTrack = LiveAPI.from(livePath.track(sourceTrackIndex));
  const destTrackIndex = destination?.trackIndex ?? sourceTrackIndex;
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
      destTrackIndex,
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
    appendedLanes,
    movedClipGroups,
  });

  // Null covers two cases, both already warned: refused before anything was
  // touched (nothing to tally), or a partial re-create that tallied itself
  // before returning here. Either way the source is left alone.
  if (newClip == null) {
    return clip.id;
  }

  // Counted against the track and position the placement wrote to — the pair
  // the "same position" warning names. Counted after the placement ran, never
  // before: a refusal above wrote nothing, while a placement that ran and then
  // failed still counts, because it cleared the target range before the copy
  // that never appeared.
  tallyMovedClip(movedClipGroups, destTrackIndex, targetBeats);

  // Verify duplicate succeeded before deleting original
  if (!newClip.exists()) {
    console.warn(
      `failed to duplicate clip ${targetLabel(clip)} - original preserved`,
    );

    return clip.id;
  }

  // The copy is confirmed here, which is what releases any clip this call held
  // back for this track and position.
  recordLandedClip(movedClipGroups, destTrackIndex, targetBeats, clip.id);

  // Clear the original to complete the move. For a self-overlapping move the
  // holding placement already trimmed it (or fully replaced it on a zero-offset
  // move), so guard with exists() — leaving a single clip at the new position.
  if (clip.exists()) {
    removeMovedSource(clip, sourceTrack);
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
  /** The lane an `l+` in this call appended, keyed by destination. */
  appendedLanes: Map<string, number>;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
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
 * @param args.appendedLanes - The lane this call already appended, shared by every `l+`
 * @param args.context - Tool execution context
 * @param args.updatedClips - Array to collect updated clips
 * @param args.noteResult - Note update result for result
 * @param args.isNonSurvivor - When true, clip is left for the deferred clear
 */
export function handleArrangementOperations({
  clip,
  isAudioClip,
  arrangementStartBeats,
  arrangementLengthBeats,
  destination,
  movedClipGroups,
  appendedLanes,
  context,
  updatedClips,
  noteResult,
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
      appendedLanes,
      updatedClips,
      noteResult,
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
    });

    finalNoteResult = recountNotesAfterLengthChange(finalClipId, noteResult);

    if (results.length > 0) {
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
