// device/tool-read-scene.js
/**
 * Read comprehensive information about a scene
 * @param {Object} args - The parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @returns {Object} Result object with scene information
 */
function readScene({ sceneIndex }) {
  const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);

  if (!scene.exists()) {
    return {
      id: null,
      name: null,
      sceneIndex,
    };
  }

  return {
    id: scene.id,
    name: scene.getProperty("name"),
    sceneIndex,
    color: scene.getColor(),
    isEmpty: scene.getProperty("is_empty") > 0,
    isTriggered: scene.getProperty("is_triggered") > 0,
    tempo: scene.getProperty("tempo"),
    isTempoEnabled: scene.getProperty("tempo_enabled") > 0,
    timeSignature: `${scene.getProperty("time_signature_numerator")}/${scene.getProperty(
      "time_signature_denominator"
    )}`,
    isTimeSignatureEnabled: scene.getProperty("time_signature_enabled") > 0,
  };
}

module.exports = { readScene };
