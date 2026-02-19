// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { handleArrangementLengthOperation } from "#src/tools/clip/arrangement/arrangement-operations.ts";
import { buildClipResultObject } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

interface ClipResult {
  id: string;
  noteCount?: number;
}

interface HandleArrangementStartArgs {
  clip: LiveAPI;
  arrangementStartBeats: number;
  tracksWithMovedClips: Map<number, number>;
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
 * @returns The new clip ID after move, or original ID on failure
 */
export function handleArrangementStartOperation({
  clip,
  arrangementStartBeats,
  tracksWithMovedClips,
}: HandleArrangementStartArgs): string {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (!isArrangementClip) {
    console.warn(
      `arrangementStart parameter ignored for session clip (id ${clip.id})`,
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

  // duplicate_clip_to_arrangement returns ["id", number] array format
  const newClipResult = track.call(
    "duplicate_clip_to_arrangement",
    toLiveApiId(clip.id),
    arrangementStartBeats,
  ) as [string, number];
  const newClip = LiveAPI.from(newClipResult);

  // Verify duplicate succeeded before deleting original
  if (!newClip.exists()) {
    console.warn(`failed to duplicate clip ${clip.id} - original preserved`);

    return clip.id;
  }

  // Delete original clip
  track.call("delete_clip", toLiveApiId(clip.id));

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
  finalNoteCount: number | null;
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
 * @param args.finalNoteCount - Final note count for result
 */
export function handleArrangementOperations({
  clip,
  isAudioClip,
  arrangementStartBeats,
  arrangementLengthBeats,
  tracksWithMovedClips,
  context,
  updatedClips,
  finalNoteCount,
}: HandleArrangementOperationsArgs): void {
  // Move FIRST so lengthening uses the new position
  let finalClipId = clip.id;
  let currentClip = clip;

  if (arrangementStartBeats != null) {
    finalClipId = handleArrangementStartOperation({
      clip,
      arrangementStartBeats,
      tracksWithMovedClips,
    });
    currentClip = LiveAPI.from(finalClipId);
  }

  // Handle arrangementLength SECOND
  let hasArrangementLengthResults = false;

  if (arrangementLengthBeats != null) {
    const results = handleArrangementLengthOperation({
      clip: currentClip,
      isAudioClip,
      arrangementLengthBeats,
      context,
    });

    if (results.length > 0) {
      updatedClips.push(...results);
      hasArrangementLengthResults = true;
    }
  }

  if (!hasArrangementLengthResults) {
    updatedClips.push(buildClipResultObject(finalClipId, finalNoteCount));
  }
}
