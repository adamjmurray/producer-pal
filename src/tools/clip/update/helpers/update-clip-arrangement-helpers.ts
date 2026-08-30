// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { handleArrangementLengthOperation } from "#src/tools/clip/arrangement/arrangement-operations.ts";
import {
  buildClipResultObject,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";
import { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";
import {
  clearClipAtDuplicateTarget,
  duplicateSelfOverlappingClip,
} from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

interface ClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
}

interface HandleArrangementStartArgs {
  clip: LiveAPI;
  arrangementStartBeats: number;
  tracksWithMovedClips: Map<number, number>;
  isMidiClip: boolean;
  context: TilingContext;
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
 * @param args.arrangementStartBeats - New position in beats
 * @param args.tracksWithMovedClips - Track of clips moved per track
 * @param args.isMidiClip - Whether the clip is MIDI
 * @param args.context - Context with silenceWavPath for audio clip operations
 * @param args.isNonSurvivor - When true, just delete the clip (optimization for
 *   multi-clip moves where this clip would be overwritten by a later longer clip)
 * @returns The new clip ID after move, original ID on failure, or null for non-survivors
 */
export function handleArrangementStartOperation({
  clip,
  arrangementStartBeats,
  tracksWithMovedClips,
  isMidiClip,
  context,
  isNonSurvivor,
}: HandleArrangementStartArgs): string | null {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (!isArrangementClip) {
    console.warn(
      `arrangementStart parameter ignored for session clip (id ${clip.id})`,
    );

    return clip.id;
  }

  // A move is copy-then-delete, and Live's API cannot delete a take-lane clip
  // (delete_clip silently no-ops on one, and TakeLane has no delete at all), so
  // any move we made would leave the original behind — a copy, not a move.
  // Warn and preserve the clip unchanged.
  if (isTakeLaneClip(clip)) {
    console.warn(
      `arrangementStart ignored for take-lane clip (id ${clip.id}): Live's API can't move a clip off a take lane. Drag it in Live's UI, or use ppal-duplicate to copy it elsewhere`,
    );

    return clip.id;
  }

  // Get track and duplicate clip to new position
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    console.warn(`could not determine trackIndex for clip ${clip.id}`);

    return clip.id;
  }

  const track = LiveAPI.from(livePath.track(trackIndex));

  // Track clips being moved to same track
  const moveCount = (tracksWithMovedClips.get(trackIndex) ?? 0) + 1;

  tracksWithMovedClips.set(trackIndex, moveCount);

  // Non-survivor: just delete, don't bother moving (it would be overwritten)
  if (isNonSurvivor) {
    if (clip.exists()) {
      track.call("delete_clip", toLiveApiId(clip.id));
    } else {
      console.warn(`non-survivor clip ${clip.id} already deleted, skipping`);
    }

    return null;
  }

  // Clear overlapping clips at target to prevent Ableton crash. A false result
  // means the clip overlaps its OWN target — route through the holding area so
  // the original is overwritten and a full copy lands at the target.
  const safeToMove = clearClipAtDuplicateTarget(
    track,
    clip.id,
    arrangementStartBeats,
    isMidiClip,
    context,
  );

  // duplicate_clip_to_arrangement returns ["id", number] array format
  const newClip = safeToMove
    ? LiveAPI.from(
        track.call(
          "duplicate_clip_to_arrangement",
          toLiveApiId(clip.id),
          arrangementStartBeats,
        ) as [string, number],
      )
    : duplicateSelfOverlappingClip(
        track,
        clip.id,
        arrangementStartBeats,
        isMidiClip,
        context,
      );

  // Verify duplicate succeeded before deleting original
  if (!newClip.exists()) {
    console.warn(`failed to duplicate clip ${clip.id} - original preserved`);

    return clip.id;
  }

  // Delete the original to complete the move. For a self-overlapping move the
  // holding placement already trimmed it (or fully replaced it on a zero-offset
  // move), so guard with exists() — leaving a single clip at the new position.
  if (safeToMove || clip.exists()) {
    track.call("delete_clip", toLiveApiId(clip.id));
  }

  // Return the new clip ID
  return newClip.id;
}

interface HandleArrangementOperationsArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementStartBeats?: number | null;
  arrangementLengthBeats?: number | null;
  tracksWithMovedClips: Map<number, number>;
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
 * @param args.tracksWithMovedClips - Map of tracks with moved clips
 * @param args.context - Tool execution context
 * @param args.updatedClips - Array to collect updated clips
 * @param args.noteResult - Note update result for result
 * @param args.isNonSurvivor - When true, clip is deleted without moving
 */
export function handleArrangementOperations({
  clip,
  isAudioClip,
  arrangementStartBeats,
  arrangementLengthBeats,
  tracksWithMovedClips,
  context,
  updatedClips,
  noteResult,
  isNonSurvivor,
}: HandleArrangementOperationsArgs): void {
  // Move FIRST so lengthening uses the new position
  let finalClipId: string | null = clip.id;
  let currentClip = clip;

  if (arrangementStartBeats != null) {
    finalClipId = handleArrangementStartOperation({
      clip,
      arrangementStartBeats,
      tracksWithMovedClips,
      isMidiClip: !isAudioClip,
      context: context as TilingContext,
      isNonSurvivor,
    });

    // Non-survivor was deleted, skip adding to results
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
      // go there. Tiles share the clip's lane — take-lane clips never reach the
      // length path — so one lane path covers the whole batch.
      const lanePath = objectPathForApi(currentClip);

      updatedClips.push(
        ...results.map((result, index) =>
          index === 0
            ? buildClipResultObject(result.id, finalNoteResult, lanePath)
            : { ...result, path: lanePath },
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
