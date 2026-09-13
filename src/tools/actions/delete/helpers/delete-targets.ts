// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a delete call names: the objects it can remove, and the entries for the
// targets it won't.
//
// A target that isn't there needed no work — what was asked for has already
// happened — so its entry says so and carries no `ok`. A target that is there
// and this call can't remove is skipped, `ok: false`, with the reason a lone
// target would have thrown.

import { type IdLookup } from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { resolvePathForType } from "#src/tools/shared/validation/id-per-path.ts";
import { typeMismatch } from "#src/tools/shared/validation/id-validation.ts";
import {
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
  /**
   * The target's address when it is still there — it named nothing, the delete
   * failed, or the target was a drum pad, which is cleared rather than removed.
   */
  path?: string;
  type: string;
  /** Only on a target this call could not delete. */
  ok?: false;
  /** Why it wasn't deleted, or why there was nothing to delete. */
  reason?: string;
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
  // Keyed by what each target resolved to, so an object named twice — by two
  // ids, or by an id and a path — is deleted once: a second positional delete
  // would shift onto and remove a different object. The last spelling wins,
  // which is also the position its entry comes back at.
  const deletable = new Map<string, DeleteTarget>();

  for (const [requestIndex, named] of targets.entries()) {
    const { target, entry } = resolveTarget(named, type, requestIndex);

    if (entry == null) {
      deletable.set(target.object.id, target);
    } else {
      settled.push(entry);
    }
  }

  return { deletable: [...deletable.values()], settled };
}

// --- Helpers below main exports ---

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
  const lookup: IdLookup =
    named.param === "id"
      ? { id: named.value }
      : resolvePathForType(type, named.value);
  // A path is echoed back as the caller wrote it. An id target has none to
  // report: the object it named is not where the call found it.
  const requestPath = named.param === "path" ? named.value : undefined;
  const address = requestPath == null ? {} : { path: requestPath };

  if (lookup.id == null) {
    return {
      entry: {
        ...address,
        type,
        ...(lookup.empty
          ? { reason: NOTHING_TO_DELETE }
          : { ok: false as const, reason: lookup.reason }),
        requestIndex,
      },
    };
  }

  const id = lookup.id;
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    return {
      entry: { id, ...address, type, reason: NOTHING_TO_DELETE, requestIndex },
    };
  }

  const refusal = undeletable(object, type);

  if (refusal != null) {
    return {
      entry: { id, ...address, type, ok: false, reason: refusal, requestIndex },
    };
  }

  return { target: { id, object, requestPath, requestIndex } };
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
  const isChain = object.type === "Chain" || object.type === "DrumChain";

  // `type="chain"` is how a caller means a chain, so only the other types
  // reject one here.
  if (type !== "chain" && isChain) {
    return (
      `${targetLabel(object)} is a ${object.type}. ` +
      (object.type === "DrumChain"
        ? `Use type="chain" for this chain, or type="drum-pad" for the whole pad.`
        : "Deleting rack chains is not supported.")
    );
  }

  return typeMismatch(object, type);
}
