import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.js";

/**
 * Creates an audio clip in a session clip slot
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} sceneIndex - Scene index for the clip
 * @param {string} sampleFile - Absolute path to audio file
 * @param {LiveAPI} liveSet - LiveAPI liveSet object
 * @param {number} i - Current iteration index
 * @param {number} maxAutoCreatedScenes - Maximum number of scenes allowed
 * @returns {object} - Object with clip and sceneIndex
 */
export function createAudioSessionClip(
  trackIndex,
  sceneIndex,
  sampleFile,
  liveSet,
  i,
  maxAutoCreatedScenes,
) {
  const currentSceneIndex = sceneIndex + i;

  // Auto-create scenes if needed (same logic as MIDI)
  if (currentSceneIndex >= maxAutoCreatedScenes) {
    throw new Error(
      `createClip failed: sceneIndex ${currentSceneIndex} exceeds the maximum allowed value of ${
        MAX_AUTO_CREATED_SCENES - 1
      }`,
    );
  }

  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (currentSceneIndex >= currentSceneCount) {
    const scenesToCreate = currentSceneIndex - currentSceneCount + 1;
    for (let j = 0; j < scenesToCreate; j++) {
      liveSet.call("create_scene", -1); // -1 means append at the end
    }
  }

  const clipSlot = new LiveAPI(
    `live_set tracks ${trackIndex} clip_slots ${currentSceneIndex}`,
  );
  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `createClip failed: a clip already exists at track ${trackIndex}, clip slot ${currentSceneIndex}`,
    );
  }

  // Create audio clip with file path
  clipSlot.call("create_audio_clip", sampleFile);

  return {
    clip: new LiveAPI(`${clipSlot.path} clip`),
    sceneIndex: currentSceneIndex,
  };
}

/**
 * Creates an audio clip in arrangement view
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} arrangementStartBeats - Start position in Ableton beats
 * @param {string} sampleFile - Absolute path to audio file
 * @param {number} clipLength - Length of clip in Ableton beats (for calculating position of multiple clips)
 * @param {number} i - Current iteration index
 * @returns {object} - Object with clip and arrangementStartBeats
 */
export function createAudioArrangementClip(
  trackIndex,
  arrangementStartBeats,
  sampleFile,
  clipLength,
  i,
) {
  const position = arrangementStartBeats + i * clipLength;

  // Live API limit check
  if (position > 1576800) {
    throw new Error(
      `createClip failed: arrangement position ${position} exceeds maximum allowed value of 1576800`,
    );
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  if (!track.exists()) {
    throw new Error(
      `createClip failed: track with index ${trackIndex} does not exist`,
    );
  }

  // Create audio clip at position
  const newClipResult = track.call("create_audio_clip", sampleFile, position);
  const clip = LiveAPI.from(newClipResult);
  if (!clip.exists()) {
    throw new Error(
      "createClip failed: failed to create audio Arrangement clip",
    );
  }

  return { clip, arrangementStartBeats: position };
}
