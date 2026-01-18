import * as console from "#src/shared/v8-max-console.js";
import { handleArrangementLengthOperation } from "#src/tools/clip/arrangement/arrangement-operations.js";
import { buildClipResultObject } from "#src/tools/clip/helpers/clip-result-helpers.js";

/**
 * Handle moving arrangement clips to a new position
 * @param {object} args - Operation arguments
 * @param {LiveAPI} args.clip - The clip to move
 * @param {number} args.arrangementStartBeats - New position in beats
 * @param {Map<number, number>} args.tracksWithMovedClips - Track of clips moved per track
 * @returns {string} The new clip ID after move
 */
export function handleArrangementStartOperation({
  clip,
  arrangementStartBeats,
  tracksWithMovedClips,
}) {
  const isArrangementClip =
    /** @type {number} */ (clip.getProperty("is_arrangement_clip")) > 0;

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
  const moveCount = (tracksWithMovedClips.get(trackIndex) || 0) + 1;

  tracksWithMovedClips.set(trackIndex, moveCount);

  const newClipResult = /** @type {string} */ (
    track.call(
      "duplicate_clip_to_arrangement",
      `id ${clip.id}`,
      arrangementStartBeats,
    )
  );
  const newClip = LiveAPI.from(newClipResult);

  // Delete original clip
  track.call("delete_clip", `id ${clip.id}`);

  // Return the new clip ID
  return newClip.id;
}

/**
 * Handle arrangement start and length operations in correct order
 * @param {object} args - Operation arguments
 * @param {LiveAPI} args.clip - The clip to operate on
 * @param {boolean} args.isAudioClip - Whether the clip is audio
 * @param {number | null} [args.arrangementStartBeats] - Target start position in beats
 * @param {number | null} [args.arrangementLengthBeats] - Target length in beats
 * @param {Map<number, number>} args.tracksWithMovedClips - Map of tracks with moved clips
 * @param {Partial<ToolContext>} args.context - Tool execution context
 * @param {Array<object>} args.updatedClips - Array to collect updated clips
 * @param {number | null} args.finalNoteCount - Final note count for result
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
}) {
  // Move FIRST so lengthening uses the new position
  let finalClipId = clip.id;
  let currentClip = clip;

  if (arrangementStartBeats != null) {
    finalClipId = handleArrangementStartOperation({
      clip,
      arrangementStartBeats,
      tracksWithMovedClips,
    });
    currentClip = LiveAPI.from(`id ${finalClipId}`);
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
