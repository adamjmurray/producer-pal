// device/tool-duplicate-scene.js
const { readScene } = require("./tool-read-scene");

/**
 * Duplicates a scene at the specified index
 * @param {Object} args - The parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @returns {Object} Result object with information about the duplicated scene
 */
function duplicateScene({ sceneIndex } = {}) {
  if (sceneIndex == null) {
    throw new Error("duplicate-scene failed: sceneIndex is required");
  }

  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_scene", sceneIndex);
  // TODO: check the results (handle invalid sceneIndex)

  return readScene({ sceneIndex: sceneIndex + 1 });
}

module.exports = { duplicateScene };
