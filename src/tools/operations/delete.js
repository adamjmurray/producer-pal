import { getHostTrackIndex } from "../shared/get-host-track-index.js";
import { parseCommaSeparatedIds } from "../shared/utils.js";
/**
 * Deletes objects by ids
 * @param {Object} args - The parameters
 * @param {string} args.ids - ID or comma-separated list of IDs to delete
 * @param {string} args.type - Type of objects to delete ("track", "scene", or "clip")
 * @returns {Object|Array<Object>} Result object(s) with success information
 */
export function deleteObject({ ids, type } = {}) {
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
  const objectsToDelete = [];
  for (const id of objectIds) {
    const object = LiveAPI.from(id);

    if (!object.exists()) {
      throw new Error(`delete failed: id "${id}" does not exist`);
    }

    if (object.type.toLowerCase() !== type) {
      throw new Error(
        `delete failed: id "${id}" is not a ${type} (type=${object.type})`,
      );
    }

    objectsToDelete.push({ id, object });
  }

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
    if (type === "track") {
      const trackIndex = Number(
        object.path.match(/live_set tracks (\d+)/)?.[1],
      );
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
    } else if (type === "scene") {
      const sceneIndex = Number(
        object.path.match(/live_set scenes (\d+)/)?.[1],
      );
      if (Number.isNaN(sceneIndex)) {
        throw new Error(
          `delete failed: no scene index for id "${id}" (path="${object.path}")`,
        );
      }
      const liveSet = new LiveAPI("live_set");
      liveSet.call("delete_scene", sceneIndex);
    } else if (type === "clip") {
      const trackIndex = object.path.match(/live_set tracks (\d+)/)?.[1];
      if (!trackIndex) {
        throw new Error(
          `delete failed: no track index for id "${id}" (path="${object.path}")`,
        );
      }
      const track = new LiveAPI(`live_set tracks ${trackIndex}`);
      track.call("delete_clip", `id ${object.id}`);
    }

    deletedObjects.push({ id, type, deleted: true });
  }

  // Return single object if single ID was provided, array if comma-separated IDs were provided
  return objectIds.length > 1 ? deletedObjects : deletedObjects[0];
}
