// device/tool-delete-scene.js
/**
 * Deletes a scene with the specified id
 * @param {Object} args - The parameters
 * @param {number} args.id - Scene id
 * @returns {Object} Result object with success information
 */
function deleteScene({ id } = {}) {
  if (!id) {
    throw new Error("delete-scene failed: id is required");
  }

  const scenePath = id.startsWith("id ") ? id : `id ${id}`;
  const scene = new LiveAPI(scenePath);

  if (!scene.exists()) {
    throw new Error(`delete-scene failed: id "${id}" does not exist`);
  }
  if (scene.type !== "Scene") {
    throw new Error(`delete-scene failed: id "${id}" was not a scene (type=${scene.type})`);
  }

  const sceneIndex = Number(scene.path.match(/live_set scenes (\d+)/)?.[1]);
  if (Number.isNaN(sceneIndex)) {
    throw new Error(`delete-scene failed: no scene index for id "${id}" (path="${scene.path}")`);
  }

  const liveSet = new LiveAPI("live_set");
  liveSet.call("delete_scene", sceneIndex);

  return { id, deleted: true };
}

module.exports = { deleteScene };
