// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { clipIdPerPath } from "#src/tools/clip/helpers/clip-path-lookup.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { deleteDrumChain } from "./helpers/delete-chain-helpers.ts";
import {
  type ResolvedPaths,
  resolvePathsToIds,
} from "./helpers/delete-path-helpers.ts";
import {
  namedIdParam,
  namedPathParam,
  parseCommaSeparatedIds,
  toLiveApiId,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  type IdentifiedObject,
  validateObjectTypes,
} from "#src/tools/shared/validation/id-validation.ts";

const PATH_SUPPORTED_TYPES = new Set(["clip", "device", "drum-pad", "chain"]);

const DELETABLE_TYPES = [
  "track",
  "scene",
  "clip",
  "device",
  "drum-pad",
  "chain",
];

const DELETABLE_TYPE_LIST = DELETABLE_TYPES.map((type) => `"${type}"`).join(
  ", ",
);

interface DeleteResult {
  /** The object's id, when the target resolved to one. */
  id?: string;
  /** The path instead, when it named nothing. */
  path?: string;
  type: string;
  deleted: boolean;
}

interface DeleteArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  type: string;
}

/**
 * Deletes objects by ids and/or paths
 * @param args - The parameters
 * @param args.id - Comma-separated list of object IDs
 * @param args.ids - Hidden alias for id
 * @param args.path - Comma-separated paths for clip/device/drum-pad/chain
 * @param args.paths - Hidden alias for path
 * @param args.type - Type of objects to delete
 * @param _context - Internal context object (unused, for consistent tool interface)
 * @returns Result object(s) with success information
 */
export function deleteObject(
  args: DeleteArgs,
  _context: Partial<ToolContext> = {},
): DeleteResult | DeleteResult[] {
  const { type } = args;
  const path = namedPathParam(args.path, args.paths);
  const targets = namedIdParam(args.id, args.ids, "ids");

  if (!type) {
    throw new Error("delete failed: type is required");
  }

  if (!DELETABLE_TYPES.includes(type)) {
    throw new Error(
      `delete failed: type must be one of ${DELETABLE_TYPE_LIST}`,
    );
  }

  // Handle path parameter - only valid for devices and drum-pads
  if (path && !PATH_SUPPORTED_TYPES.has(type)) {
    console.warn(
      `delete: path parameter is only valid for types "clip", "device", "drum-pad", or "chain", ignoring paths`,
    );
  }

  // Collect IDs from both sources
  const objectIds = targets ? parseCommaSeparatedIds(targets) : [];

  // Resolve paths to IDs for the types that can be addressed by location.
  // A path that names nothing is reported, not dropped: an empty result reads
  // as "nothing to do", and a model that skims past the warning calls the
  // delete done.
  const unresolvedPaths: string[] = [];

  if (path && PATH_SUPPORTED_TYPES.has(type)) {
    const resolvedPaths =
      type === "clip"
        ? resolveClipPaths(path)
        : resolvePathsToIds(parseCommaSeparatedIds(path), type);

    objectIds.push(...resolvedPaths.ids);
    unresolvedPaths.push(...resolvedPaths.unresolved);
  }

  const skipped = unresolvedPaths.map((unresolved): DeleteResult => ({
    path: unresolved,
    type,
    deleted: false,
  }));

  if (objectIds.length === 0) {
    if (!targets && !path) {
      throw new Error("delete failed: id or path is required");
    }

    return unwrapSingleResult(skipped);
  }

  const deletedObjects: DeleteResult[] = [];

  // Validate all objects exist and are the correct type before deleting any.
  // De-dup by resolved id: a repeated id (or an id and a path pointing at the
  // same object) must be deleted once. A second positional delete would shift
  // onto and remove a different object.
  const seenIds = new Set<string>();
  // Resolve each id once and run both checks off that object: the rack-chain
  // check used to build its own, so every target cost two objects before the
  // delete itself.
  const resolved: IdentifiedObject[] = objectIds.map((id) => ({
    id,
    object: LiveAPI.from(id),
  }));
  const objectsToDelete = validateObjectTypes(
    type === "chain"
      ? resolved
      : resolved.filter((target) => !isRackChain(target.object)),
    type,
    "delete",
    { skipInvalid: true },
  )
    .map((object) => ({ id: object.id, object }))
    .filter(({ id }) => {
      if (seenIds.has(id)) return false;

      seenIds.add(id);

      return true;
    });

  // Tracks, scenes, and devices delete by position, so an earlier delete shifts
  // later siblings. Sort highest-index-first so each delete targets the right
  // object.
  //
  // Clips and chains are deliberately NOT sorted: they delete by id
  // (`delete_clip <id>`, and a chain by parking it on a free pad), so a sibling
  // shift never reaches them. Measured on 12.4.3 by
  // e2e/mcp/operations/ppal-delete-batch-ordering.test.ts, which deletes three
  // of four ascending — the worst case — and checks which one survived.
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
  } else if (type === "device") {
    objectsToDelete.sort((a, b) =>
      compareDevicesForDeletion(a.object, b.object),
    );
  }

  // One object per track for the whole call, not per clip. Deleting a clip
  // never moves a track, so the one resolved first stays the right one.
  const tracks = new Map<number, LiveAPI>();

  for (const { id, object } of objectsToDelete) {
    const deleted = deleteObjectByType(type, id, object, tracks);

    deletedObjects.push({ id, type, deleted });
  }

  // Same reasoning as unresolved paths: an id validateObjectTypes rejected —
  // gone, or the wrong kind of object — is reported rather than dropped.
  const kept = new Set(objectsToDelete.map(({ object }) => object.id));
  const rejected = new Set(
    resolved.filter(({ object }) => !kept.has(object.id)).map(({ id }) => id),
  );

  for (const id of rejected) {
    deletedObjects.push({ id, type, deleted: false });
  }

  return unwrapSingleResult([...deletedObjects, ...skipped]);
}

/**
 * The clip lookup in the shape the path resolvers use, so both branches report
 * their misses the same way.
 * @param path - Comma-separated clip slot paths
 * @returns The clip ids found, plus the paths that held no clip
 */
function resolveClipPaths(path: string): ResolvedPaths {
  const entries = parseCommaSeparatedIds(path);
  const ids: string[] = [];
  const unresolved: string[] = [];

  for (const [index, clipId] of clipIdPerPath(path, "delete").entries()) {
    if (clipId == null) {
      unresolved.push(entries[index] ?? path);
    } else {
      ids.push(clipId);
    }
  }

  return { ids, unresolved };
}

/**
 * Reports whether an object is a rack chain, warning when it is. A DrumChain
 * would otherwise slip past the drum-pad type check and take a
 * `delete_all_chains` that silently does nothing. Only reached for the other
 * types — `type="chain"` is how a caller means a chain.
 * @param object - The resolved object
 * @returns True when it is a chain, which this type must skip
 */
function isRackChain(object: LiveAPI): boolean {
  // Leave a nonexistent object to validateObjectTypes, which already warns.
  if (!object.exists()) return false;

  if (object.type !== "Chain" && object.type !== "DrumChain") return false;

  console.warn(
    `delete: id "${object.id}" is a ${object.type}. ` +
      (object.type === "DrumChain"
        ? `Use type="chain" for this chain, or type="drum-pad" for the whole pad.`
        : "Deleting rack chains is not supported."),
  );

  return true;
}

/**
 * Confirms a delete landed. Live refuses some of them without saying so — the
 * call returns the same thing either way — so whether the object is still there
 * is the only signal.
 *
 * Look the id up again rather than asking the object the delete ran through:
 * measured on 12.4.3, that one still reports its old id and path afterward. A
 * fresh lookup of a dead id lands nowhere and reads id "0".
 *
 * @param type - The tool-level type, for the warning
 * @param id - The object ID
 * @returns true if the object is gone, false if it survived
 */
function confirmDeleted(type: string, id: string): boolean {
  if (LiveAPI.from(id).exists()) {
    console.warn(
      `delete: ${type} "${id}" still exists, so Live did not delete it`,
    );

    return false;
  }

  return true;
}

/**
 * Deletes a track by its index
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if the track is gone, false if skipped or Live refused
 */
function deleteTrackObject(id: string, object: LiveAPI): boolean {
  // Check for return track first
  const returnMatch = object.path.match(/live_set return_tracks (\d+)/);

  if (returnMatch) {
    const returnTrackIndex = Number(returnMatch[1]);
    const liveSet = LiveAPI.from(livePath.liveSet);

    liveSet.call("delete_return_track", returnTrackIndex);

    return confirmDeleted("track", id);
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

  return confirmDeleted("track", id);
}

/**
 * Deletes a scene by its index
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if the scene is gone, false if skipped or Live refused
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

  return confirmDeleted("scene", id);
}

/**
 * Deletes a clip by its track and clip ID
 * @param id - The object ID
 * @param object - The object to delete
 * @param tracks - Tracks already resolved this call, keyed by index
 * @returns true if the clip is gone, false if skipped or Live refused
 */
function deleteClipObject(
  id: string,
  object: LiveAPI,
  tracks: Map<number, LiveAPI>,
): boolean {
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

  const track = trackAt(tracks, Number(trackIndex));

  track.call("delete_clip", toLiveApiId(object.id));

  return confirmDeleted("clip", id);
}

interface PathSegment {
  collection: string;
  index: number;
}

/**
 * Orders devices for safe positional deletion. `delete_device N` removes by
 * index within a parent, so an earlier delete shifts every later sibling down.
 * Comparing the full `(collection, index)` segment lists gives one consistent
 * total order satisfying both safety rules:
 *
 * - **Siblings** (same parent) sort highest-index-first, so an earlier delete
 *   never shifts a later sibling onto the wrong index.
 * - **Descendants before ancestors**: when one path is a prefix of the other,
 *   the longer (nested) device deletes first, before the rack whose deletion
 *   would invalidate its path.
 *
 * Comparing segments — rather than the old parent-path *string length* — avoids
 * a non-transitive comparator: two devices in sibling chains of the same rack
 * have equal-length parent paths, which the length heuristic treated as
 * sort-equal, letting one interpose between two true siblings and flip their
 * delete order (deleting the lower index first, shifting the higher target).
 * @param a - First device
 * @param b - Second device
 * @returns Negative if a deletes first, positive if b deletes first
 */
function compareDevicesForDeletion(a: LiveAPI, b: LiveAPI): number {
  const segsA = parsePathSegments(a.path);
  const segsB = parsePathSegments(b.path);
  const sharedDepth = Math.min(segsA.length, segsB.length);

  for (let i = 0; i < sharedDepth; i++) {
    const segA = segsA[i] as PathSegment;
    const segB = segsB[i] as PathSegment;

    if (segA.collection !== segB.collection) {
      // Different sub-collections of a shared parent (e.g. chains vs
      // return_chains) — independent deletes, so order is irrelevant to
      // correctness; a stable name comparison just keeps the sort consistent.
      return segA.collection < segB.collection ? -1 : 1;
    }

    if (segA.index !== segB.index) {
      return segB.index - segA.index; // Siblings: highest index first
    }
  }

  // One path is a prefix of the other: the longer one is nested inside the
  // shorter (its ancestor). Delete the descendant first.
  return segsB.length - segsA.length;
}

/**
 * Splits a Live API path into its ordered `(collection, index)` segments, e.g.
 * `live_set tracks 0 devices 1 chains 0 devices 2` →
 * `[(tracks,0), (devices,1), (chains,0), (devices,2)]`. The leading `live_set`
 * token has no index and is skipped.
 * @param path - The Live API path
 * @returns Ordered path segments
 */
function parsePathSegments(path: string): PathSegment[] {
  return [...path.matchAll(/(\w+) (\d+)/g)].map((match) => ({
    collection: match[1] as string,
    index: Number(match[2]),
  }));
}

/**
 * Deletes a device by its ID via the parent (track or chain)
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if the device is gone, false if skipped or Live refused
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

  return confirmDeleted("device", id);
}

/**
 * Deletes (clears) a drum pad by removing all its chains
 * @param id - The object ID
 * @param object - The object to delete
 * @returns true if the pad's chains are gone, false if any survived
 */
function deleteDrumPadObject(id: string, object: LiveAPI): boolean {
  object.call("delete_all_chains");

  // The pad outlives its own delete, so there is no dead object to test for.
  // Read the chains back instead: a refused clear is otherwise indistinguishable
  // from a successful one.
  if (object.getChildCount("chains") > 0) {
    console.warn(
      `delete: drum pad "${id}" still has chains, so Live did not clear it`,
    );

    return false;
  }

  return true;
}

/**
 * The track at an index, resolved once per call.
 * @param tracks - Tracks already resolved this call, keyed by index
 * @param trackIndex - The track's index
 * @returns The track
 */
function trackAt(tracks: Map<number, LiveAPI>, trackIndex: number): LiveAPI {
  const known = tracks.get(trackIndex);

  if (known != null) return known;

  const track = LiveAPI.from(livePath.track(trackIndex));

  tracks.set(trackIndex, track);

  return track;
}

/**
 * Deletes an object based on its type
 * @param type - The type of object ("track", "scene", "clip", "device", "drum-pad", or "chain")
 * @param id - The object ID
 * @param object - The object to delete
 * @param tracks - Tracks already resolved this call, keyed by index
 * @returns true if deleted, false if skipped with a warning
 */
function deleteObjectByType(
  type: string,
  id: string,
  object: LiveAPI,
  tracks: Map<number, LiveAPI>,
): boolean {
  // Tracks have their own check below, by index — it names the track, which is
  // what the user asked for. Everything else routes through here.
  if (type !== "track" && isProducerPalDevice(object)) {
    console.warn(
      `delete: cannot delete the Producer Pal device (it is running this tool), skipping`,
    );

    return false;
  }

  if (type === "track") return deleteTrackObject(id, object);
  if (type === "scene") return deleteSceneObject(id, object);
  if (type === "clip") return deleteClipObject(id, object, tracks);
  if (type === "device") return deleteDeviceObject(id, object);
  if (type === "drum-pad") return deleteDrumPadObject(id, object);

  return deleteDrumChain(id, object);
}
