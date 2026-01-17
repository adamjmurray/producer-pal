// @ts-nocheck -- TODO: Add JSDoc type annotations
import { prepareSessionClipSlot } from "#src/tools/clip/helpers/clip-result-helpers.js";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.js";

/**
 * Creates an audio clip in a session clip slot
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} sceneIndex - Target scene index (0-based)
 * @param {string} sampleFile - Absolute path to audio file
 * @param {LiveAPI} liveSet - LiveAPI liveSet object
 * @param {number} maxAutoCreatedScenes - Maximum number of scenes allowed
 * @returns {object} - Object with clip and sceneIndex
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
 * @param {number} arrangementStartBeats - Start position in Ableton beats
 * @param {string} sampleFile - Absolute path to audio file
 * @returns {object} - Object with clip and arrangementStartBeats
 */
export function createAudioArrangementClip(
  trackIndex,
  arrangementStartBeats,
  sampleFile,
) {
  // Live API limit check
  if (arrangementStartBeats > MAX_ARRANGEMENT_POSITION_BEATS) {
    throw new Error(
      `arrangement position ${arrangementStartBeats} exceeds maximum allowed value of ${MAX_ARRANGEMENT_POSITION_BEATS}`,
    );
  }

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  // Create audio clip at position
  const newClipResult = track.call(
    "create_audio_clip",
    sampleFile,
    arrangementStartBeats,
  );
  const clip = LiveAPI.from(newClipResult);

  if (!clip.exists()) {
    throw new Error("failed to create audio Arrangement clip");
  }

  return { clip, arrangementStartBeats };
}
