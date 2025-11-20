import { getHostTrackIndex } from "../../shared/arrangement/get-host-track-index.js";
import { parseCommaSeparatedIds } from "../../shared/utils.js";
import { validateIdTypes } from "../../shared/validation/id-validation.js";

/**
 * Deletes a track by its index
 * @param {string} id - The object ID
 * @param {object} object - The object to delete
 */
function deleteTrackObject(id, object) {
  const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);
  if (Number.isNaN(trackIndex)) {
    throw new Error(
      `delete failed: no track index for id "${id}" (path="${object.path}")`,
    );
  }

  const hostTrackIndex = getHostTrackIndex();
  if (trackIndex === hostTrackIndex) {
    throw new Error(
      "delete failed: cannot delete track hosting the Producer Pal device",
    );
  }

  const liveSet = new LiveAPI("live_set");
  liveSet.call("delete_track", trackIndex);
}

/**
 * Deletes a scene by its index
 * @param {string} id - The object ID
 * @param {object} object - The object to delete
 */
function deleteSceneObject(id, object) {
  const sceneIndex = Number(object.path.match(/live_set scenes (\d+)/)?.[1]);
  if (Number.isNaN(sceneIndex)) {
    throw new Error(
      `delete failed: no scene index for id "${id}" (path="${object.path}")`,
    );
  }
  const liveSet = new LiveAPI("live_set");
  liveSet.call("delete_scene", sceneIndex);
}

/**
 * Deletes a clip by its track and clip ID
 * @param {string} id - The object ID
 * @param {object} object - The object to delete
 */
function deleteClipObject(id, object) {
  const trackIndex = object.path.match(/live_set tracks (\d+)/)?.[1];
  if (!trackIndex) {
    throw new Error(
      `delete failed: no track index for id "${id}" (path="${object.path}")`,
    );
  }
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  track.call("delete_clip", `id ${object.id}`);
}

/**
 * Deletes an object based on its type
 * @param {string} type - The type of object ("track", "scene", or "clip")
 * @param {string} id - The object ID
 * @param {object} object - The object to delete
 */
function deleteObjectByType(type, id, object) {
  if (type === "track") {
    deleteTrackObject(id, object);
  } else if (type === "scene") {
    deleteSceneObject(id, object);
  } else if (type === "clip") {
    deleteClipObject(id, object);
  }
}

/**
 * Deletes objects by ids
 * @param {object} args - The parameters
 * @param {string} args.ids - ID or comma-separated list of IDs to delete
 * @param {string} args.type - Type of objects to delete ("track", "scene", or "clip")
 * @param {object} _context - Internal context object (unused)
 * @returns {object | Array<object>} Result object(s) with success information
 */
export function deleteObject({ ids, type } = {}, _context = {}) {
  if (!ids) {
    throw new Error("delete failed: ids is required");
  }
  if (!type) {
    throw new Error("delete failed: type is required");
  }
  if (!["track", "scene", "clip"].includes(type)) {
    throw new Error(
      `delete failed: type must be one of "track", "scene", or "clip"`,
    );
  }

  // Parse comma-separated string into array
  const objectIds = parseCommaSeparatedIds(ids);

  const deletedObjects = [];

  // Validate all objects exist and are the correct type before deleting any
  const objectsToDelete = validateIdTypes(objectIds, type, "delete", {
    skipInvalid: true,
  }).map((object) => ({ id: object.id, object }));

  // Now delete all objects (in reverse order for tracks/scenes to maintain indices)
  if (type === "track" || type === "scene") {
    // Sort by index in descending order to delete from highest to lowest index
    objectsToDelete.sort((a, b) => {
      const pathRegex =
        type === "track" ? /live_set tracks (\d+)/ : /live_set scenes (\d+)/;
      const indexA = Number(a.object.path.match(pathRegex)?.[1]);
      const indexB = Number(b.object.path.match(pathRegex)?.[1]);
      return indexB - indexA; // Descending order
    });
  }

  for (const { id, object } of objectsToDelete) {
    deleteObjectByType(type, id, object);
    deletedObjects.push({ id, type, deleted: true });
  }

  // Return single object if one valid result, array for multiple results or empty array for none
  if (deletedObjects.length === 0) {
    return [];
  }
  return deletedObjects.length === 1 ? deletedObjects[0] : deletedObjects;
}
