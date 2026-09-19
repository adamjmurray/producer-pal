// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DELETABLE_TYPES } from "#src/tools/constants.ts";
import { sortForPositionalDelete } from "./helpers/positional-delete-order.ts";
import { deleteObjectByType } from "./helpers/delete-object-by-type.ts";
import {
  type DeleteResult,
  type DeleteTarget,
  type IndexedDeleteResult,
  resolveDeleteTargets,
} from "./helpers/delete-targets.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  namedIdParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import { unwrapSingleResult } from "#src/tools/shared/helpers/target-entries.ts";

const DELETABLE_TYPE_LIST = DELETABLE_TYPES.map((type) => `"${type}"`).join(
  ", ",
);

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
 * @returns One entry per target named, unwrapped when the call named one
 */
export function deleteObject(
  args: DeleteArgs,
  _context: Partial<ToolContext> = {},
): DeleteResult | DeleteResult[] {
  const { type } = args;

  if (!type) {
    throw new Error("type is required");
  }

  if (!(DELETABLE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`type must be one of ${DELETABLE_TYPE_LIST}`);
  }

  const { deletable, settled } = resolveDeleteTargets(
    namedIdParam(args.id, args.ids, "ids"),
    namedPathParam(args.path, args.paths),
    type,
  );

  // Highest index first, so deleting one never shifts a later target.
  sortForPositionalDelete(deletable, type);

  // One object per track for the whole call, not per clip. Deleting a clip
  // never moves a track, so the one resolved first stays the right one.
  const tracks = new Map<number, LiveAPI>();
  const deleted = deletable.map((target) => deleteOne(target, type, tracks));

  return unwrapSingleResult(
    refuseLoneSkip(orderedResults([...deleted, ...settled])),
  );
}

// --- Helpers below main exports ---

/**
 * Delete one target, and say what became of it.
 * @param target - The object to delete, with the spelling that named it
 * @param type - Type of objects to delete
 * @param tracks - Tracks already resolved this call, keyed by index
 * @returns The entry for this target
 */
function deleteOne(
  target: DeleteTarget,
  type: string,
  tracks: Map<number, LiveAPI>,
): IndexedDeleteResult {
  const { id, object, requestPath, requestIndex } = target;
  // Take the address before the delete: afterwards the path names whatever slid
  // into the slot. The caller's own spelling wins when they gave one.
  const address = requestPath ?? objectPathForApi(object);
  const refusal = deleteObjectByType(type, id, object, tracks);

  // A drum pad is cleared, not removed, so it is still at its path.
  return {
    id,
    ...addressField(address, refusal == null && type !== "drum-pad"),
    type,
    ...(refusal == null ? {} : { ok: false as const, reason: refusal }),
    requestIndex,
  };
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
 * Refuse a lone target this call couldn't delete. Nothing was deleted and there
 * is no list for the entry to hold a place in, so the reason goes back as the
 * error it would have been all along. A lone target that needed no work is
 * satisfied, not refused.
 * @param results - Every entry this call produced
 * @returns The same entries
 * @throws Error carrying the reason, when the one target was skipped
 */
function refuseLoneSkip(results: DeleteResult[]): DeleteResult[] {
  const [only] = results;

  if (results.length === 1 && only?.ok === false) {
    throw new Error(only.reason);
  }

  return results;
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
