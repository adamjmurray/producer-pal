import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.js";
import { prepareSessionClipSlot } from "#src/tools/clip/helpers/clip-result-helpers.js";

/**
 * Creates an audio clip in a session clip slot
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} sceneIndex - Target scene index (0-based)
 * @param {string} sampleFile - Absolute path to audio file
 * @param {LiveAPI} liveSet - LiveAPI liveSet object
 * @param {number} maxAutoCreatedScenes - Maximum number of scenes allowed
 * @returns {{clip: LiveAPI, sceneIndex: number}} Object with clip and sceneIndex
 */
export function createAudioSessionClip(
  trackIndex,
  sceneIndex,
  sampleFile,
  liveSet,
  maxAutoCreatedScenes,
) {
  const clipSlot = prepareSessionClipSlot(
    trackIndex,
    sceneIndex,
    liveSet,
    maxAutoCreatedScenes,
  );

  clipSlot.call("create_audio_clip", sampleFile);

  return {
    clip: LiveAPI.from(`${clipSlot.path} clip`),
    sceneIndex,
  };
}

/**
 * Creates an audio clip in arrangement view
 * @param {number} trackIndex - Track index (0-based)
 * @param {number | null} arrangementStartBeats - Start position in Ableton beats
 * @param {string} sampleFile - Absolute path to audio file
 * @returns {{clip: LiveAPI, arrangementStartBeats: number | null}} Object with clip and arrangementStartBeats
 */
export function createAudioArrangementClip(
  trackIndex,
  arrangementStartBeats,
  sampleFile,
) {
  // Live API limit check
  if (
    arrangementStartBeats != null &&
    arrangementStartBeats > MAX_ARRANGEMENT_POSITION_BEATS
  ) {
    throw new Error(
      `arrangement position ${arrangementStartBeats} exceeds maximum allowed value of ${MAX_ARRANGEMENT_POSITION_BEATS}`,
    );
  }

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  // Create audio clip at position
  const newClipResult = /** @type {string} */ (
    track.call("create_audio_clip", sampleFile, arrangementStartBeats)
  );
  const clip = LiveAPI.from(newClipResult);

  if (!clip.exists()) {
    throw new Error("failed to create audio Arrangement clip");
  }

  return { clip, arrangementStartBeats };
}
