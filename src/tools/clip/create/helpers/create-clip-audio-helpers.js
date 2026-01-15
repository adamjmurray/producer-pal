import {
  MAX_ARRANGEMENT_POSITION_BEATS,
  MAX_AUTO_CREATED_SCENES,
} from "#src/tools/constants.js";

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
  // Auto-create scenes if needed (same logic as MIDI)
  if (sceneIndex >= maxAutoCreatedScenes) {
    throw new Error(
      `sceneIndex ${sceneIndex} exceeds the maximum allowed value of ${
        MAX_AUTO_CREATED_SCENES - 1
      }`,
    );
  }

  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex >= currentSceneCount) {
    const scenesToCreate = sceneIndex - currentSceneCount + 1;

    for (let j = 0; j < scenesToCreate; j++) {
      liveSet.call("create_scene", -1); // -1 means append at the end
    }
  }

  const clipSlot = new LiveAPI(
    `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
  );

  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `a clip already exists at track ${trackIndex}, clip slot ${sceneIndex}`,
    );
  }

  // Create audio clip with file path
  clipSlot.call("create_audio_clip", sampleFile);

  return {
    clip: new LiveAPI(`${clipSlot.path} clip`),
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

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

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
