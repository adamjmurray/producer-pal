import * as console from "#src/shared/v8-max-console.js";

/**
 * Handle moving arrangement clips to a new position
 * @param {object} args - Operation arguments
 * @param {LiveAPI} args.clip - The clip to move
 * @param {number} args.arrangementStartBeats - New position in beats
 * @param {Map} args.tracksWithMovedClips - Track of clips moved per track
 * @returns {string} The new clip ID after move
 */
export function handleArrangementStartOperation({
  clip,
  arrangementStartBeats,
  tracksWithMovedClips,
}) {
  const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;

  if (!isArrangementClip) {
    console.error(
      `Warning: arrangementStart parameter ignored for session clip (id ${clip.id})`,
    );

    return clip.id;
  }

  // Get track and duplicate clip to new position
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  // Track clips being moved to same track
  const moveCount = (tracksWithMovedClips.get(trackIndex) || 0) + 1;

  tracksWithMovedClips.set(trackIndex, moveCount);

  const newClipResult = track.call(
    "duplicate_clip_to_arrangement",
    `id ${clip.id}`,
    arrangementStartBeats,
  );
  const newClip = LiveAPI.from(newClipResult);

  // Delete original clip
  track.call("delete_clip", `id ${clip.id}`);

  // Return the new clip ID
  return newClip.id;
}
