// device/tool-delete-scene.js
/**
 * Deletes a scene at the specified index
 * @param {Object} args - The parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @returns {Object} Result object with success or error information
 */
function deleteScene({ sceneIndex }) {
  const liveSet = new LiveAPI("live_set");
  const sceneIds = liveSet.getChildIds("scenes");

  if (sceneIndex < 0 || sceneIndex >= sceneIds.length) {
    return {
      success: false,
      sceneIndex,
      error: `Scene index ${sceneIndex} is out of range. Valid range: 0-${sceneIds.length - 1}`,
    };
  }

  // Get the scene ID before deletion
  const sceneId = sceneIds[sceneIndex];
  const scene = new LiveAPI(sceneId);
  const sceneName = scene.getProperty("name");

  // Delete the scene
  liveSet.call("delete_scene", sceneIndex);

  return {
    success: true,
    sceneIndex,
    message: `Deleted scene "${sceneName}" at index ${sceneIndex}`,
  };
}

module.exports = { deleteScene };
