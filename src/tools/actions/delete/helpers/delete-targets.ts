// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a delete call names: the objects it can remove, and the entries for the
// targets it won't.
//
// A target that isn't there needed no work — what was asked for has already
// happened — so its entry says so and carries no `ok`, as does one repeating an
// object named earlier. A target that is there and this call can't remove is
// skipped, `ok: false`, with the reason a lone target would have thrown.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type IdLookup } from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { resolvePathForType } from "#src/tools/shared/validation/id-per-path.ts";
import { typeMismatch } from "#src/tools/shared/validation/id-validation.ts";
import {
  type ObjectPath,
  parseObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import {
  namedLaterReason,
  namedTargets,
  type NamedTarget,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** What the call has to say about one target. */
export interface DeleteResult {
  /** The object's id, when the target resolved to one. */
  id?: string;
  /**
   * The address of an object this call removed. It is an address from before
   * the call: a positional delete shifts later siblings, so afterwards this
   * path names whatever slid into the slot.
   */
  deletedPath?: string;
  /** The target's address when this entry removed nothing. */
  path?: string;
  /** Only on a target this call could not delete. */
  ok?: false;
  /** Why it wasn't deleted, or why there was nothing left for it to delete. */
  detail?: string;
}

/** A result entry tagged with its target's position in the request. */
export interface IndexedDeleteResult extends DeleteResult {
  requestIndex: number;
}

/** An object to delete, the spelling that named it, and where it was named. */
export interface DeleteTarget {
  id: string;
  object: LiveAPI;
  /** The caller's own spelling, when the target came from `path`. */
  requestPath?: string;
  /** Position among all named targets, so the result can restore this order. */
  requestIndex: number;
}

/** What a call's targets came to. */
export interface ResolvedTargets {
  /** The objects to delete, one entry per object, in the order named. */
  deletable: DeleteTarget[];
  /** Entries for the targets this call won't delete. */
  settled: IndexedDeleteResult[];
}

/** One named target: the object to delete, or the entry saying why not. */
type TargetOutcome =
  | { target: DeleteTarget; entry?: undefined }
  | { target?: undefined; entry: IndexedDeleteResult };

/** An absent target: what the call asked for has already happened. */
const NOTHING_TO_DELETE = "nothing to delete";

/**
 * Resolve every target a delete call names.
 * @param ids - The `id` param, comma-separated
 * @param path - The `path` param, comma-separated
 * @param type - Type of objects to delete
 * @returns The objects to delete, and the entries for the targets it won't
 * @throws Error when the call names no target at all
 */
export function resolveDeleteTargets(
  ids: string | null | undefined,
  path: string | null | undefined,
  type: string,
): ResolvedTargets {
  const targets = namedTargets({ id: ids, path });

  if (targets.length === 0) {
    throw new Error("id or path is required");
  }

  const settled: IndexedDeleteResult[] = [];
  const deletable: DeleteTarget[] = [];
  const resolved = targets.map((named, requestIndex) =>
    resolveTarget(named, type, requestIndex),
  );
  // The last target to name an object deletes it; deleting it again would
  // shift another object into the slot and remove that instead. Keyed by what
  // each target resolved to, so an id and a path naming one object are caught.
  const lastNamedBy = new Map<string, NamedTarget>();

  for (const [requestIndex, { target }] of resolved.entries()) {
    if (target != null) {
      lastNamedBy.set(target.object.id, targets[requestIndex] as NamedTarget);
    }
  }

  for (const [requestIndex, { target, entry }] of resolved.entries()) {
    if (entry != null) {
      settled.push(entry);
      continue;
    }

    const later = lastNamedBy.get(target.object.id) as NamedTarget;

    if (later !== targets[requestIndex]) {
      settled.push({
        id: target.id,
        ...requestAddress(target.requestPath),
        detail: namedLaterReason(later),
        requestIndex,
      });
      continue;
    }

    deletable.push(target);
  }

  return { deletable, settled };
}

// --- Helpers below main exports ---

/** Why no take lane can be deleted, after the lane's own label. */
const TAKE_LANE_REFUSAL =
  "is a take lane, which Live's API can't delete; remove it in Live's UI";

/**
 * The id of the take lane a path names, when there is one. No delete type
 * reaches a take lane, so the type's own lookup would call an existing lane the
 * wrong kind; with its id, the refusal says what it is.
 * @param requestPath - One path, as the caller wrote it
 * @returns The lane's id, or null for any other path or a lane that isn't
 *   there, which the type's lookup reports
 */
function existingTakeLane(requestPath: string): IdLookup | null {
  let parsed: ObjectPath;

  try {
    parsed = parseObjectPath(requestPath);
  } catch {
    return null;
  }

  if (parsed.kind !== "take-lane") {
    return null;
  }

  const lane = LiveAPI.from(
    livePath.track(parsed.trackIndex).takeLane(parsed.laneIndex),
  );

  return lane.exists() ? { id: lane.id } : null;
}

/**
 * One named target: the object to delete, or the entry standing in for it.
 * @param named - The target, as the caller named it
 * @param type - Type of objects to delete
 * @param requestIndex - Its position among the named targets
 * @returns The object to delete, or the entry saying why there isn't one
 */
function resolveTarget(
  named: NamedTarget,
  type: string,
  requestIndex: number,
): TargetOutcome {
  const requestPath = named.param === "path" ? named.value : undefined;
  const address = requestAddress(requestPath);

  const lookup: IdLookup =
    requestPath == null
      ? { id: named.value }
      : (existingTakeLane(requestPath) ??
        resolvePathForType(type, requestPath));

  if (lookup.id == null) {
    return {
      entry: {
        ...address,
        ...(lookup.empty
          ? { detail: NOTHING_TO_DELETE }
          : { ok: false as const, detail: lookup.reason }),
        requestIndex,
      },
    };
  }

  const id = lookup.id;
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    return {
      entry: { id, ...address, detail: NOTHING_TO_DELETE, requestIndex },
    };
  }

  const refusal = undeletable(object, type);

  if (refusal != null) {
    return {
      entry: { id, ...address, ok: false, detail: refusal, requestIndex },
    };
  }

  return { target: { id, object, requestPath, requestIndex } };
}

/**
 * The caller's own path as a spreadable field. A path is echoed back the way it
 * was written; an id target has none to report, because the object it named is
 * not where the call found it.
 * @param requestPath - The path the caller wrote, when they wrote one
 * @returns `{ path }`, or `{}` for a target named by id
 */
function requestAddress(requestPath: string | undefined): { path?: string } {
  return requestPath == null ? {} : { path: requestPath };
}

/**
 * Why this call can't delete an object that is there, or null when it can. A
 * DrumChain would otherwise slip past the drum-pad type check and take a
 * `delete_all_chains` that silently does nothing.
 * @param object - The object the target resolved to
 * @param type - Type of objects to delete
 * @returns The reason, or null when the object can be deleted
 */
function undeletable(object: LiveAPI, type: string): string | null {
  if (object.type === "TakeLane") {
    return `${targetLabel(object)} ${TAKE_LANE_REFUSAL}`;
  }

  const isChain = object.type === "Chain" || object.type === "DrumChain";

  // `type="chain"` is how a caller means a chain, so only the other types
  // reject one here.
  if (type !== "chain" && isChain) {
    return (
      `${targetLabel(object)} is a chain. ` +
      (object.type === "DrumChain"
        ? `Use type="chain" for this chain, or type="drum-pad" for the whole pad.`
        : "Deleting rack chains is not supported.")
    );
  }

  return typeMismatch(object, type);
}
