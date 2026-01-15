import * as console from "#src/shared/v8-max-console.js";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.js";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.js";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.js";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.js";

const PATH_SUPPORTED_TYPES = new Set(["device", "drum-pad"]);

/**
 * Deletes objects by ids and/or paths
 * @param {object} args - The parameters
 * @param {string} [args.ids] - ID or comma-separated list of IDs to delete
 * @param {string} [args.path] - Path or comma-separated paths to delete (for device or drum-pad types)
 * @param {string} args.type - Type of objects to delete ("track", "scene", "clip", "device", or "drum-pad")
 * @param {object} _context - Internal context object (unused)
 * @returns {object | Array<object>} Result object(s) with success information
 */
export function deleteObject({ ids, path, type } = {}, _context = {}) {
  if (!type) {
    throw new Error("delete failed: type is required");
  }

  if (!["track", "scene", "clip", "device", "drum-pad"].includes(type)) {
    throw new Error(
      `delete failed: type must be one of "track", "scene", "clip", "device", or "drum-pad"`,
    );
  }

  // Handle path parameter - only valid for devices and drum-pads
  if (path && !PATH_SUPPORTED_TYPES.has(type)) {
    console.error(
      `delete: path parameter is only valid for types "device" or "drum-pad", ignoring paths`,
    );
  }

  // Collect IDs from both sources
  const objectIds = ids ? parseCommaSeparatedIds(ids) : [];

  // Resolve paths to IDs for device or drum-pad types
  if (path && PATH_SUPPORTED_TYPES.has(type)) {
    const paths = parseCommaSeparatedIds(path);
    const pathIds = resolvePathsToIds(paths, type);

    objectIds.push(...pathIds);
  }

  if (objectIds.length === 0) {
    throw new Error("delete failed: ids or path is required");
  }

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

  return unwrapSingleResult(deletedObjects);
}

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

  const liveSet = LiveAPI.from("live_set");

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

  const liveSet = LiveAPI.from("live_set");

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

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  track.call("delete_clip", `id ${object.id}`);
}

/**
 * Deletes a device by its ID via the parent (track or chain)
 * @param {string} id - The object ID
 * @param {object} object - The object to delete
 */
function deleteDeviceObject(id, object) {
  // Find the LAST "devices X" in the path to handle nested devices
  // e.g., "live_set tracks 1 devices 0 chains 0 devices 1" -> last match is "devices 1"
  const deviceMatches = [...object.path.matchAll(/devices (\d+)/g)];

  if (deviceMatches.length === 0) {
    throw new Error(
      `delete failed: could not find device index in path "${object.path}"`,
    );
  }

  const lastMatch = deviceMatches.at(-1);
  const deviceIndex = Number(lastMatch[1]);

  // Parent path is everything before the last "devices X"
  const parentPath = object.path.substring(0, lastMatch.index).trim();

  if (!parentPath) {
    throw new Error(
      `delete failed: could not extract parent path from device "${id}" (path="${object.path}")`,
    );
  }

  const parent = LiveAPI.from(parentPath);

  parent.call("delete_device", deviceIndex);
}

/**
 * Deletes (clears) a drum pad by removing all its chains
 * @param {string} id - The object ID
 * @param {object} object - The object to delete
 */
function deleteDrumPadObject(id, object) {
  const drumPad = LiveAPI.from(`id ${object.id}`);

  drumPad.call("delete_all_chains");
}

/**
 * Deletes an object based on its type
 * @param {string} type - The type of object ("track", "scene", "clip", "device", or "drum-pad")
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
  } else if (type === "device") {
    deleteDeviceObject(id, object);
  } else if (type === "drum-pad") {
    deleteDrumPadObject(id, object);
  }
}

/**
 * Resolves paths to their IDs for device or drum-pad types
 * @param {string[]} paths - Array of paths to resolve
 * @param {string} type - The target type ("device" or "drum-pad")
 * @returns {string[]} Array of resolved IDs
 */
function resolvePathsToIds(paths, type) {
  const ids = [];

  for (const targetPath of paths) {
    try {
      const resolved = resolvePathToLiveApi(targetPath);
      const resolvedId = resolvePathToId(resolved, targetPath, type);

      if (resolvedId) {
        ids.push(resolvedId);
      }
    } catch (e) {
      console.error(`delete: ${e.message}`);
    }
  }

  return ids;
}

/**
 * Resolves a single path resolution result to an ID
 * @param {object} resolved - Result from resolvePathToLiveApi
 * @param {string} targetPath - Original path for error messages
 * @param {string} type - The target type ("device" or "drum-pad")
 * @returns {string|null} The resolved ID or null
 */
function resolvePathToId(resolved, targetPath, type) {
  // For drum-pad type, only accept drum-pad paths (no nested navigation)
  if (type === "drum-pad") {
    if (resolved.targetType !== "drum-pad") {
      console.error(
        `delete: path "${targetPath}" resolves to ${resolved.targetType}, not drum-pad`,
      );

      return null;
    }

    // Use shared helper to get just the drum pad (no remaining segments)
    const result = resolveDrumPadFromPath(
      resolved.liveApiPath,
      resolved.drumPadNote,
      [], // Ignore remaining segments for drum-pad deletion
    );

    if (!result.target) {
      console.error(`delete: drum-pad at path "${targetPath}" does not exist`);

      return null;
    }

    return result.target.id;
  }

  // For device type, handle both direct device paths and nested device paths in drum pads
  if (type === "device") {
    // Direct device path (not through drum pad)
    if (resolved.targetType === "device") {
      const target = LiveAPI.from(resolved.liveApiPath);

      if (!target.exists()) {
        console.error(`delete: device at path "${targetPath}" does not exist`);

        return null;
      }

      return target.id;
    }

    // Device nested inside a drum pad (path like 1/0/pC1/0/0)
    if (
      resolved.targetType === "drum-pad" &&
      resolved.remainingSegments?.length >= 2
    ) {
      const result = resolveDrumPadFromPath(
        resolved.liveApiPath,
        resolved.drumPadNote,
        resolved.remainingSegments,
      );

      if (!result.target || result.targetType !== "device") {
        console.error(`delete: device at path "${targetPath}" does not exist`);

        return null;
      }

      return result.target.id;
    }

    console.error(
      `delete: path "${targetPath}" resolves to ${resolved.targetType}, not device`,
    );

    return null;
  }

  return null;
}
