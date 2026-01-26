import * as console from "#src/shared/v8-max-console.ts";
import { handleArrangementLengthOperation } from "#src/tools/clip/arrangement/arrangement-operations.ts";
import { buildClipResultObject } from "#src/tools/clip/helpers/clip-result-helpers.ts";

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
 * Handle moving arrangement clips to a new position
 * @param args - Operation arguments
 * @param args.clip - The clip to move
 * @param args.arrangementStartBeats - New position in beats
 * @param args.tracksWithMovedClips - Track of clips moved per track
 * @returns The new clip ID after move
 */
export function handleArrangementStartOperation({
  clip,
  arrangementStartBeats,
  tracksWithMovedClips,
}: HandleArrangementStartArgs): string {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (!isArrangementClip) {
    console.error(
      `Warning: arrangementStart parameter ignored for session clip (id ${clip.id})`,
    );

    return clip.id;
  }

  // Get track and duplicate clip to new position
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    console.error(
      `Warning: could not determine trackIndex for clip ${clip.id}`,
    );

    return clip.id;
  }

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  // Track clips being moved to same track
  const moveCount = (tracksWithMovedClips.get(trackIndex) ?? 0) + 1;

  tracksWithMovedClips.set(trackIndex, moveCount);

  const newClipResult = track.call(
    "duplicate_clip_to_arrangement",
    clip.id,
    arrangementStartBeats,
  ) as string;
  const newClip = LiveAPI.from(newClipResult);

  // Verify duplicate succeeded before deleting original
  if (!newClip.exists()) {
    console.error(
      `Warning: failed to duplicate clip ${clip.id} - original preserved`,
    );

    return clip.id;
  }

  // Delete original clip
  track.call("delete_clip", clip.id);

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
