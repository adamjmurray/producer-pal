// device/tool-play-session-scene.js
/**
 * Launches all clips in the specified scene
 * @param {Object} args - The parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @returns {Object} Result with success message
 */
function playSessionScene({ sceneIndex } = {}) {
  if (sceneIndex == null) {
    throw new Error("play-session-scene failed: sceneIndex is required");
  }

  const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);

  if (!scene.exists()) {
    throw new Error(`play-session-scene failed: scene at sceneIndex=${sceneIndex} does not exist`);
  }

  // Switch to Session view
  new LiveAPI("live_app view").call("show_view", "Session");

  scene.call("fire");

  return { message: `Scene at sceneIndex=${sceneIndex} has been triggered` };
}

module.exports = { playSessionScene };
