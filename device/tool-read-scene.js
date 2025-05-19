// device/tool-read-scene.js
const { readClip } = require("./tool-read-clip");

/**
 * Read comprehensive information about a scene
 * @param {Object} args - The parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @param {boolean} [args.includeClips=false] - Whether to include clip information
 * @returns {Object} Result object with scene information
 */
function readScene({ sceneIndex, includeClips = false }) {
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
  const isTimeSignatureEnabled = scene.getProperty("time_signature_enabled") > 0;

  return {
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
    clips: includeClips
      ? liveSet
          .getChildIds("tracks")
          .map((_trackId, trackIndex) => readClip({ trackIndex, clipSlotIndex: sceneIndex }))
          .filter((clip) => clip.id != null)
      : undefined,
  };
}

module.exports = { readScene };
