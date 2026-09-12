// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DELETABLE_TYPES } from "#src/tools/constants.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { sortForPositionalDelete } from "./helpers/positional-delete-order.ts";
import { deleteObjectByType } from "./helpers/delete-object-by-type.ts";
import { idPerPathForType } from "#src/tools/shared/validation/id-per-path.ts";
import {
  objectPathForApi,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { type IdPerPath } from "#src/tools/shared/validation/lists/target-lists.ts";
import {
  namedIdParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import {
  targetEntries,
  unwrapSingleResult,
} from "#src/tools/shared/helpers/target-entries.ts";
import {
  type IdentifiedObject,
  validateObjectTypes,
} from "#src/tools/shared/validation/id-validation.ts";

/** A target to delete, and the path the caller named it by, if they did. */
interface DeleteTarget {
  id: string;
  /** The caller's own spelling, when the target came from `path`. */
  requestPath?: string;
  /** Position among all named targets, so the result can restore this order. */
  requestIndex: number;
}

/** A resolved target, keeping the spelling through validation and the sort. */
interface ResolvedTarget extends IdentifiedObject {
  requestPath?: string;
  requestIndex: number;
}

/** A path entry that named nothing deletable, and its position among targets. */
interface UnresolvedPath {
  path: string;
  requestIndex: number;
}

/** What a batch of paths resolved to, and which of them named nothing. */
interface ResolvedPaths {
  /** The objects the paths named, in path order. */
  targets: DeleteTarget[];
  /** Paths that named nothing deletable. The warning says why. */
  unresolved: UnresolvedPath[];
}

/** A result entry tagged with its target's position in the request. */
interface IndexedDeleteResult extends DeleteResult {
  requestIndex: number;
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
    ? targetEntries(targets, "id").map((id, requestIndex) => ({
        id,
        requestIndex,
      }))
    : [];

  // Resolve paths to IDs for the types that can be addressed by location.
  // A path that names nothing is reported, not dropped: an empty result reads
  // as "nothing to do", and a model that skims past the warning calls the
  // delete done.
  const unresolvedPaths: UnresolvedPath[] = [];

  // Every deletable type can be addressed by location, so a path is always
  // usable by the time the type check above has passed. Paths are named after
  // any ids, so their positions continue where the id list left off.
  if (path) {
    const resolvedPaths = resolvePerPath(
      path,
      idPerPathForType(type),
      namedTargets.length,
    );

    namedTargets.push(...resolvedPaths.targets);
    unresolvedPaths.push(...resolvedPaths.unresolved);
  }

  const skipped: IndexedDeleteResult[] = unresolvedPaths.map(
    ({ path: unresolved, requestIndex }) => ({
      path: unresolved,
      type,
      deleted: false,
      requestIndex,
    }),
  );

  if (namedTargets.length === 0) {
    if (!targets && !path) {
      throw new Error("id or path is required");
    }

    return unwrapSingleResult(orderedResults(skipped));
  }

  const deletedObjects: IndexedDeleteResult[] = [];

  // Validate all objects exist and are the correct type before deleting any.
  // De-dup by resolved id: a repeated id (or an id and a path pointing at the
  // same object) must be deleted once. A second positional delete would shift
  // onto and remove a different object.
  const seenIds = new Set<string>();
  // Resolve each id once and run both checks off that object: the rack-chain
  // check used to build its own, so every target cost two objects before the
  // delete itself.
  const resolved: ResolvedTarget[] = namedTargets.map(
    ({ id, requestPath, requestIndex }) => ({
      id,
      requestPath,
      requestIndex,
      object: LiveAPI.from(id),
    }),
  );
  // The caller's own spelling and position, keyed by what each target
  // resolved to, so the result can echo both back after the sort has
  // reordered the targets for deletion. Keyed on the resolved id: only
  // objects that exist reach the delete loop, so two targets can't collide
  // here on a dead object's shared id.
  const requestById = new Map(
    resolved.map((target) => [
      target.object.id,
      { requestPath: target.requestPath, requestIndex: target.requestIndex },
    ]),
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
      if (seenIds.has(id)) {
        return false;
      }

      seenIds.add(id);

      return true;
    });

  sortForPositionalDelete(objectsToDelete, type);

  // One object per track for the whole call, not per clip. Deleting a clip
  // never moves a track, so the one resolved first stays the right one.
  const tracks = new Map<number, LiveAPI>();

  for (const { id, object } of objectsToDelete) {
    // Every resolved target carries a requestPath/requestIndex pair;
    // objectsToDelete draws only from resolved, so the lookup always hits.
    const { requestPath, requestIndex } = requestById.get(object.id) as {
      requestPath?: string;
      requestIndex: number;
    };
    // Take the address before the delete: afterwards the path names whatever
    // slid into the slot. The caller's own spelling wins when they gave one.
    const address = requestPath ?? objectPathForApi(object);
    const deleted = deleteObjectByType(type, id, object, tracks);

    // A drum pad is cleared, not removed, so it is still at its path.
    deletedObjects.push({
      id,
      ...addressField(address, deleted && type !== "drum-pad"),
      type,
      deleted,
      requestIndex,
    });
  }

  // Same reasoning as unresolved paths: an id validateObjectTypes rejected —
  // gone, or the wrong kind of object — is reported rather than dropped.
  const kept = new Set(objectsToDelete.map(({ object }) => object.id));
  const seenRejected = new Set<string>();

  for (const { id, object, requestPath, requestIndex } of resolved) {
    if (kept.has(object.id) || seenRejected.has(id)) {
      continue;
    }

    seenRejected.add(id);
    // No address to take when it was named by id: the object isn't there.
    deletedObjects.push(
      requestPath == null
        ? { id, type, deleted: false, requestIndex }
        : { id, path: requestPath, type, deleted: false, requestIndex },
    );
  }

  return unwrapSingleResult(orderedResults([...deletedObjects, ...skipped]));
}

/**
 * Restores the order the caller named their targets in, undoing the
 * highest-index-first sort used for safe positional deletion. Drops the
 * internal requestIndex before the result goes out.
 * @param results - Result entries tagged with each target's named position
 * @returns The entries in the order the caller named their targets
 */
function orderedResults(results: IndexedDeleteResult[]): DeleteResult[] {
  return results
    .toSorted((a, b) => a.requestIndex - b.requestIndex)
    .map(({ requestIndex: _requestIndex, ...result }) => result);
}

/**
 * Splits the lookup's per-entry answer into the targets it found and the paths
 * it didn't, so a miss can be reported as a target rather than dropped. Each
 * target keeps the caller's spelling and named position for the result to
 * echo back.
 * @param path - Comma-separated paths
 * @param lookup - The type's path-to-id lookup
 * @param startIndex - This path list's offset into the overall named order
 * @returns The targets found, plus the paths that named nothing
 */
function resolvePerPath(
  path: string,
  lookup: IdPerPath,
  startIndex: number,
): ResolvedPaths {
  const entries = targetEntries(path, "path");
  const targets: DeleteTarget[] = [];
  const unresolved: UnresolvedPath[] = [];

  for (const [index, id] of lookup(path).entries()) {
    const requestPath = entries[index] ?? path;
    const requestIndex = startIndex + index;

    if (id == null) {
      unresolved.push({ path: requestPath, requestIndex });
    } else {
      targets.push({ id, requestPath, requestIndex });
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
  if (!object.exists()) {
    return false;
  }

  if (object.type !== "Chain" && object.type !== "DrumChain") {
    return false;
  }

  console.warn(
    `${targetLabel(object)} is a ${object.type}. ` +
      (object.type === "DrumChain"
        ? `Use type="chain" for this chain, or type="drum-pad" for the whole pad.`
        : "Deleting rack chains is not supported."),
  );

  return true;
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
  if (address == null) {
    return {};
  }

  return removed ? { deletedPath: address } : { path: address };
}
