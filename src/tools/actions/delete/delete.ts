// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { DELETABLE_TYPES } from "#src/tools/constants.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { deleteTrackObject } from "./helpers/delete-track-helpers.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { deleteDrumChain } from "./helpers/delete-chain-helpers.ts";
import { idPerPathForType } from "#src/tools/shared/validation/id-per-path.ts";
import {
  objectPathForApi,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { type IdPerPath } from "#src/tools/shared/validation/lists/target-lists.ts";
import {
  namedIdParam,
  namedPathParam,
  targetEntries,
  toLiveApiId,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  type IdentifiedObject,
  validateObjectTypes,
} from "#src/tools/shared/validation/id-validation.ts";

/** A target to delete, and the path the caller named it by, if they did. */
interface DeleteTarget {
  id: string;
  /** The caller's own spelling, when the target came from `path`. */
  requestPath?: string;
}

/** A resolved target, keeping the spelling through validation and the sort. */
interface ResolvedTarget extends IdentifiedObject {
  requestPath?: string;
}

/** What a batch of paths resolved to, and which of them named nothing. */
interface ResolvedPaths {
  /** The objects the paths named, in path order. */
  targets: DeleteTarget[];
  /** Paths that named nothing deletable. The warning says why. */
  unresolved: string[];
}

const DELETABLE_TYPE_LIST = DELETABLE_TYPES.map((type) => `"${type}"`).join(
  ", ",
);

interface DeleteResult {
  /** The object's id, when the target resolved to one. */
  id?: string;
  /**
   * The address of an object this call removed. It is an address from before
   * the call: a positional delete shifts later siblings, so afterwards this
   * path names whatever slid into the slot.
   */
  deletedPath?: string;
  /**
   * The target's address when it is still there — it named nothing, the delete
   * failed, or the target was a drum pad, which is cleared rather than removed.
   */
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
 * @param args.path - Comma-separated paths naming what to delete
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
    throw new Error("type is required");
  }

  if (!(DELETABLE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`type must be one of ${DELETABLE_TYPE_LIST}`);
  }

  // Collect IDs from both sources. targets is already confirmed non-blank, so
  // an id that parses to nothing (e.g. ",  ,") is worth a warning of its own
  // rather than reading the same as an omitted id.
  const namedTargets: DeleteTarget[] = targets
    ? targetEntries(targets, "id").map((id) => ({ id }))
    : [];

  // Resolve paths to IDs for the types that can be addressed by location.
  // A path that names nothing is reported, not dropped: an empty result reads
  // as "nothing to do", and a model that skims past the warning calls the
  // delete done.
  const unresolvedPaths: string[] = [];

  // Every deletable type can be addressed by location, so a path is always
  // usable by the time the type check above has passed.
  if (path) {
    const resolvedPaths = resolvePerPath(path, idPerPathForType(type));

    namedTargets.push(...resolvedPaths.targets);
    unresolvedPaths.push(...resolvedPaths.unresolved);
  }

  const skipped = unresolvedPaths.map((unresolved): DeleteResult => ({
    path: unresolved,
    type,
    deleted: false,
  }));

  if (namedTargets.length === 0) {
    if (!targets && !path) {
      throw new Error("id or path is required");
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
  const resolved: ResolvedTarget[] = namedTargets.map(
    ({ id, requestPath }) => ({ id, requestPath, object: LiveAPI.from(id) }),
  );
  // The caller's own spelling, keyed by what it resolved to, so the result can
  // echo it back after the sort has reordered the targets. Keyed
  // on the resolved id: only objects that exist reach the delete loop, so two
  // targets can't collide here on a dead object's shared id.
  const requestPaths = new Map(
    resolved
      .filter((target) => target.requestPath != null)
      .map((target) => [target.object.id, target.requestPath as string]),
  );
  const objectsToDelete = validateObjectTypes(
    type === "chain"
      ? resolved
      : resolved.filter((target) => !isRackChain(target.object)),
    type,
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
    // Take the address before the delete: afterwards the path names whatever
    // slid into the slot. The caller's own spelling wins when they gave one.
    const address = requestPaths.get(object.id) ?? objectPathForApi(object);
    const deleted = deleteObjectByType(type, id, object, tracks);

    // A drum pad is cleared, not removed, so it is still at its path.
    deletedObjects.push({
      id,
      ...addressField(address, deleted && type !== "drum-pad"),
      type,
      deleted,
    });
  }

  // Same reasoning as unresolved paths: an id validateObjectTypes rejected —
  // gone, or the wrong kind of object — is reported rather than dropped.
  const kept = new Set(objectsToDelete.map(({ object }) => object.id));
  const seenRejected = new Set<string>();

  for (const { id, object, requestPath } of resolved) {
    if (kept.has(object.id) || seenRejected.has(id)) continue;

    seenRejected.add(id);
    // No address to take when it was named by id: the object isn't there.
    deletedObjects.push(
      requestPath == null
        ? { id, type, deleted: false }
        : { id, path: requestPath, type, deleted: false },
    );
  }

  return unwrapSingleResult([...deletedObjects, ...skipped]);
}

/**
 * Splits the lookup's per-entry answer into the targets it found and the paths
 * it didn't, so a miss can be reported as a target rather than dropped. Each
 * target keeps the caller's spelling for the result to echo back.
 * @param path - Comma-separated paths
 * @param lookup - The type's path-to-id lookup
 * @returns The targets found, plus the paths that named nothing
 */
function resolvePerPath(path: string, lookup: IdPerPath): ResolvedPaths {
  const entries = targetEntries(path, "path");
  const targets: DeleteTarget[] = [];
  const unresolved: string[] = [];

  for (const [index, id] of lookup(path).entries()) {
    const requestPath = entries[index] ?? path;

    if (id == null) {
      unresolved.push(requestPath);
    } else {
      targets.push({ id, requestPath });
    }
  }

  return { targets, unresolved };
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
    `${targetLabel(object)} is a ${object.type}. ` +
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
  const survivor = LiveAPI.from(id);

  if (survivor.exists()) {
    console.warn(
      `${type} ${targetLabel(survivor)} still exists, so Live did not delete it`,
    );

    return false;
  }

  return true;
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
      `no scene index for ${targetLabel(object)} (Live path "${object.path}"), skipping`,
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
      `cannot delete take-lane clip ${targetLabel(object)} via the API; remove it in Live's UI`,
    );

    return false;
  }

  const trackIndex = object.path.match(/live_set tracks (\d+)/)?.[1];

  if (!trackIndex) {
    console.warn(
      `no track index for ${targetLabel(object)} (Live path "${object.path}"), skipping`,
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
      `no device index for ${targetLabel(object)} (Live path "${object.path}"), skipping`,
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
      `no parent path for device ${targetLabel(object)} (Live path "${object.path}"), skipping`,
    );

    return false;
  }

  const parent = LiveAPI.from(parentPath);

  parent.call("delete_device", deviceIndex);

  return confirmDeleted("device", id);
}

/**
 * Deletes (clears) a drum pad by removing all its chains
 * @param object - The object to delete
 * @returns true if the pad's chains are gone, false if any survived
 */
function deleteDrumPadObject(object: LiveAPI): boolean {
  object.call("delete_all_chains");

  // The pad outlives its own delete, so there is no dead object to test for.
  // Read the chains back instead: a refused clear is otherwise indistinguishable
  // from a successful one.
  if (object.getChildCount("chains") > 0) {
    console.warn(
      `drum pad ${targetLabel(object)} still has chains, so Live did not clear it`,
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
      `cannot delete the Producer Pal device ${targetLabel(object)} (it is running this tool), skipping`,
    );

    return false;
  }

  if (type === "track") return deleteTrackObject(id, object, confirmDeleted);
  if (type === "scene") return deleteSceneObject(id, object);
  if (type === "clip") return deleteClipObject(id, object, tracks);
  if (type === "device") return deleteDeviceObject(id, object);
  if (type === "drum-pad") return deleteDrumPadObject(object);

  return deleteDrumChain(id, object);
}

/**
 * The address as a spreadable field, under the key that says whether the object
 * is still there. Omitted entirely for an object the grammar can't spell.
 * @param address - The address the target had, or undefined
 * @param removed - Whether the call removed the object
 * @returns `{ deletedPath }`, `{ path }`, or `{}`
 */
function addressField(
  address: string | undefined,
  removed: boolean,
): { deletedPath?: string; path?: string } {
  if (address == null) return {};

  return removed ? { deletedPath: address } : { path: address };
}
