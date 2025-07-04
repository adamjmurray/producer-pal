// src/tools/read-scene.js
import { readClip } from "./read-clip";

/**
 * Read comprehensive information about a scene
 * @param {Object} args - The parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @param {boolean} [args.includeClips=false] - Whether to include clip information
 * @returns {Object} Result object with scene information
 */
export function readScene({ sceneIndex, includeClips = false }) {
  const liveSet = new LiveAPI(`live_set`);
  const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);

  if (!scene.exists()) {
    return {
      id: null,
      name: null,
      sceneIndex,
    };
  }

  const isTempoEnabled = scene.getProperty("tempo_enabled") > 0;
  const isTimeSignatureEnabled =
    scene.getProperty("time_signature_enabled") > 0;

  const result = {
    id: scene.id,
    name: scene.getProperty("name"),
    sceneIndex,
    color: scene.getColor(),
    isEmpty: scene.getProperty("is_empty") > 0,
    isTriggered: scene.getProperty("is_triggered") > 0,
    tempo: isTempoEnabled ? scene.getProperty("tempo") : "disabled",
    timeSignature: isTimeSignatureEnabled
      ? `${scene.getProperty("time_signature_numerator")}/${scene.getProperty("time_signature_denominator")}`
      : "disabled",
  };

  if (includeClips) {
    result.clips = liveSet
      .getChildIds("tracks")
      .map((_trackId, trackIndex) =>
        readClip({ trackIndex, clipSlotIndex: sceneIndex }),
      )
      .filter((clip) => clip.id != null);
  }

  return result;
}
