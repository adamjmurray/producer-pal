// device/tool-delete.js
/**
 * Deletes an object by id
 * @param {Object} args - The parameters
 * @param {string} args.id - ID of the object to delete
 * @param {string} args.type - Type of object to delete ("track", "scene", or "clip")
 * @returns {Object} Result object with success information
 */
function deleteObject({ id, type } = {}) {
  if (!id) {
    throw new Error("delete failed: id is required");
  }
  if (!type) {
    throw new Error("delete failed: type is required");
  }
  if (!["track", "scene", "clip"].includes(type)) {
    throw new Error(`delete failed: type must be one of "track", "scene", or "clip"`);
  }

  // Convert string ID to LiveAPI path if needed
  const objectPath = id.startsWith("id ") ? id : `id ${id}`;
  const object = new LiveAPI(objectPath);

  if (!object.exists()) {
    throw new Error(`delete failed: id "${id}" does not exist`);
  }

  if (object.type.toLowerCase() !== type) {
    throw new Error(`delete failed: id "${id}" is not a ${type} (type=${object.type})`);
  }

  if (type === "track") {
    const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);
    if (Number.isNaN(trackIndex)) {
      throw new Error(`delete failed: no track index for id "${id}" (path="${object.path}")`);
    }
    const liveSet = new LiveAPI("live_set");
    liveSet.call("delete_track", trackIndex);
  } else if (type === "scene") {
    const sceneIndex = Number(object.path.match(/live_set scenes (\d+)/)?.[1]);
    if (Number.isNaN(sceneIndex)) {
      throw new Error(`delete failed: no scene index for id "${id}" (path="${object.path}")`);
    }
    const liveSet = new LiveAPI("live_set");
    liveSet.call("delete_scene", sceneIndex);
  } else if (type === "clip") {
    const trackIndex = object.path.match(/live_set tracks (\d+)/)?.[1];
    if (!trackIndex) {
      throw new Error(`delete failed: no track index for id "${id}" (path="${object.path}")`);
    }
    const track = new LiveAPI(`live_set tracks ${trackIndex}`);
    track.call("delete_clip", `id ${object.id}`);
  }

  return { id, type, deleted: true };
}

module.exports = { deleteObject };
