// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { type ResolvedPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import {
  parseCommaSeparatedIds,
  toLiveApiId,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";

const PATH_SUPPORTED_TYPES = new Set(["device", "drum-pad"]);

interface DeleteResult {
  id: string;
  type: string;
  deleted: boolean;
}

interface DeleteArgs {
  ids?: string;
  path?: string;
  type: string;
}

/**
 * Deletes objects by ids and/or paths
 * @param args - The parameters
 * @param args.ids - Comma-separated list of object IDs
 * @param args.path - Comma-separated paths for device/drum-pad
 * @param args.type - Type of objects to delete
 * @param _context - Internal context object (unused, for consistent tool interface)
 * @returns Result object(s) with success information
 */
export function deleteObject(
  { ids, path, type }: DeleteArgs,
  _context: Partial<ToolContext> = {},
): DeleteResult | DeleteResult[] {
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
    console.warn(
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
    if (!ids && !path) {
      throw new Error("delete failed: ids or path is required");
    }

    return [];
  }

  const deletedObjects: DeleteResult[] = [];

  // Validate all objects exist and are the correct type before deleting any
  const objectsToDelete = validateIdTypes(objectIds, type, "delete", {
    skipInvalid: true,
  }).map((object) => ({ id: object.id, object }));

  // Now delete all objects (in reverse order for tracks/scenes to maintain indices)
  if (type === "track" || type === "scene") {
    // Sort by index in descending order to delete from highest to lowest index
    objectsToDelete.sort((a, b) => {
      // For tracks, handle both regular and return tracks
      const pathRegex =
        type === "track"
          ? /live_set (?:return_)?tracks (\d+)/
          : /live_set scenes (\d+)/;
      const indexA = Number(a.object.path.match(pathRegex)?.[1]);
      const indexB = Number(b.object.path.match(pathRegex)?.[1]);

      return indexB - indexA; // Descending order
    });
  }

  for (const { id, object } of objectsToDelete) {
    const deleted = deleteObjectByType(type, id, object);

    deletedObjects.push({ id, type, deleted });
  }

  return unwrapSingleResult(deletedObjects);
}

/**
 * Deletes a track by its index
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if deleted, false if skipped with warning
 */
function deleteTrackObject(id: string, object: LiveAPI): boolean {
  // Check for return track first
  const returnMatch = object.path.match(/live_set return_tracks (\d+)/);

  if (returnMatch) {
    const returnTrackIndex = Number(returnMatch[1]);
    const liveSet = LiveAPI.from(livePath.liveSet);

    liveSet.call("delete_return_track", returnTrackIndex);

    return true;
  }

  // Regular track
  const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);

  if (Number.isNaN(trackIndex)) {
    console.warn(
      `delete: no track index for id "${id}" (path="${object.path}"), skipping`,
    );

    return false;
  }

  const hostTrackIndex = getHostTrackIndex();

  if (trackIndex === hostTrackIndex) {
    console.warn(
      "delete: cannot delete track hosting the Producer Pal device, skipping",
    );

    return false;
  }

  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call("delete_track", trackIndex);

  return true;
}

/**
 * Deletes a scene by its index
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if deleted, false if skipped with warning
 */
function deleteSceneObject(id: string, object: LiveAPI): boolean {
  const sceneIndex = Number(object.path.match(/live_set scenes (\d+)/)?.[1]);

  if (Number.isNaN(sceneIndex)) {
    console.warn(
      `delete: no scene index for id "${id}" (path="${object.path}"), skipping`,
    );

    return false;
  }

  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call("delete_scene", sceneIndex);

  return true;
}

/**
 * Deletes a clip by its track and clip ID
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if deleted, false if skipped with warning
 */
function deleteClipObject(id: string, object: LiveAPI): boolean {
  // Take-lane clips cannot be removed via the API (delete_clip is a no-op for
  // them and there is no delete_take_lane) — the user must delete in Live's UI.
  if (isTakeLaneClip(object)) {
    console.warn(
      `delete: cannot delete take-lane clip "${id}" via the API; remove it in Live's UI`,
    );

    return false;
  }

  const trackIndex = object.path.match(/live_set tracks (\d+)/)?.[1];

  if (!trackIndex) {
    console.warn(
      `delete: no track index for id "${id}" (path="${object.path}"), skipping`,
    );

    return false;
  }

  const track = LiveAPI.from(livePath.track(Number(trackIndex)));

  track.call("delete_clip", toLiveApiId(object.id));

  return true;
}

/**
 * Deletes a device by its ID via the parent (track or chain)
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if deleted, false if skipped with warning
 */
function deleteDeviceObject(id: string, object: LiveAPI): boolean {
  // Find the LAST "devices X" in the path to handle nested devices
  // e.g., "live_set tracks 1 devices 0 chains 0 devices 1" -> last match is "devices 1"
  const deviceMatches = [...object.path.matchAll(/devices (\d+)/g)];

  if (deviceMatches.length === 0) {
    console.warn(
      `delete: could not find device index in path "${object.path}", skipping`,
    );

    return false;
  }

  // We know deviceMatches has at least one element from the check above
  const lastMatch = deviceMatches.at(-1) as RegExpExecArray;
  const deviceIndex = Number(lastMatch[1]);

  // Parent path is everything before the last "devices X"
  const parentPath = object.path.substring(0, lastMatch.index).trim();

  if (!parentPath) {
    console.warn(
      `delete: could not extract parent path from device "${id}" (path="${object.path}"), skipping`,
    );

    return false;
  }

  const parent = LiveAPI.from(parentPath);

  parent.call("delete_device", deviceIndex);

  return true;
}

/**
 * Deletes (clears) a drum pad by removing all its chains
 * @param _id - The object ID (unused, kept for consistent signature)
 * @param object - The object to delete
 * @returns true (drum-pad clear has no validation failure path)
 */
function deleteDrumPadObject(_id: string, object: LiveAPI): boolean {
  const drumPad = LiveAPI.from(toLiveApiId(object.id));

  drumPad.call("delete_all_chains");

  return true;
}

/**
 * Deletes an object based on its type
 * @param type - The type of object ("track", "scene", "clip", "device", or "drum-pad")
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if deleted, false if skipped with a warning
 */
function deleteObjectByType(
  type: string,
  id: string,
  object: LiveAPI,
): boolean {
  if (type === "track") return deleteTrackObject(id, object);
  if (type === "scene") return deleteSceneObject(id, object);
  if (type === "clip") return deleteClipObject(id, object);
  if (type === "device") return deleteDeviceObject(id, object);
  if (type === "drum-pad") return deleteDrumPadObject(id, object);

  return false;
}

/**
 * Resolves paths to their IDs for device or drum-pad types
 * @param paths - Array of paths to resolve
 * @param type - The target type ("device" or "drum-pad")
 * @returns Array of resolved IDs
 */
function resolvePathsToIds(paths: string[], type: string): string[] {
  const ids: string[] = [];

  for (const targetPath of paths) {
    try {
      const resolved = resolvePathToLiveApi(targetPath);
      const resolvedId = resolvePathToId(resolved, targetPath, type);

      if (resolvedId) {
        ids.push(resolvedId);
      }
    } catch (e) {
      console.warn(`delete: ${errorMessage(e)}`);
    }
  }

  return ids;
}

/**
 * Resolves a single path resolution result to an ID
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @param type - The target type ("device" or "drum-pad")
 * @returns The resolved ID or null
 */
function resolvePathToId(
  resolved: ResolvedPath,
  targetPath: string,
  type: string,
): string | null {
  // For drum-pad type, only accept drum-pad paths (no nested navigation)
  if (type === "drum-pad") {
    if (resolved.targetType !== "drum-pad") {
      console.warn(
        `delete: path "${targetPath}" resolves to ${resolved.targetType}, not drum-pad`,
      );

      return null;
    }

    // Use shared helper to get just the drum pad (no remaining segments)
    const result = resolveDrumPadFromPath(
      resolved.liveApiPath,
      resolved.drumPadNote as string,
      [], // Ignore remaining segments for drum-pad deletion
    );

    if (!result.target) {
      console.warn(`delete: drum-pad at path "${targetPath}" does not exist`);

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
        console.warn(`delete: device at path "${targetPath}" does not exist`);

        return null;
      }

      return target.id;
    }

    // Device nested inside a drum pad. Two forms resolve to the same device:
    // the explicit-chain `t0/d0/pC1/c0/d0` (remainingSegments ["c0","d0"]) and
    // the implicit-chain `t0/d0/pC1/d0` (["d0"], chain 0 implied) — matching the
    // forms read-device and update-device accept. `>= 1` covers both; a bare pad
    // (`pC1`, length 0) is the whole-pad case handled as a "drum-pad" delete, and
    // an explicit chain with no device (`pC1/c0`, ["c0"]) resolves to a chain and
    // is rejected by the targetType check below.
    if (
      resolved.targetType === "drum-pad" &&
      resolved.remainingSegments.length > 0
    ) {
      const result = resolveDrumPadFromPath(
        resolved.liveApiPath,
        resolved.drumPadNote as string,
        resolved.remainingSegments,
      );

      if (!result.target || result.targetType !== "device") {
        console.warn(`delete: device at path "${targetPath}" does not exist`);

        return null;
      }

      return result.target.id;
    }

    console.warn(
      `delete: path "${targetPath}" resolves to ${resolved.targetType}, not device`,
    );

    return null;
  }

  return null;
}
