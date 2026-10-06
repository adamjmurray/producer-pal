// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a delete call names: the objects it can remove, and the targets it
// won't.
//
// A target that isn't there needed no work — what was asked for has already
// happened — so it is written as a no-op entry with no `ok`. A target that is
// there and this call can't remove is skipped, with the reason a lone target
// would have thrown. A path that can't be parsed refuses the whole call.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type IdLookup } from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { resolvePathForType } from "#src/tools/shared/validation/id-per-path.ts";
import { refuseUnparsableEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { typeMismatch } from "#src/tools/shared/validation/id-validation.ts";
import {
  type NamedTarget,
  namedTargets,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type DeleteCall } from "./parse-delete-call.ts";

/** What one target of a delete call carries into its write. */
export type DeletePayload =
  | {
      kind: "delete";
      id: string;
      object: LiveAPI;
      /** The caller's own spelling, when the target came from `path` */
      requestPath?: string;
    }
  | {
      /** Nothing is there, so the write has nothing to do */
      kind: "nothing";
    };

/** An absent target: what the call asked for has already happened. */
export const NOTHING_TO_DELETE = "nothing to delete";

/**
 * Name every target a delete call makes, and resolve each now, before the
 * first delete.
 * @param call - The delete call
 * @returns One target per entry named, in the order named
 * @throws Error when a list has a hole, or a path can't be parsed
 */
export function deleteTargets(call: DeleteCall): Array<Target<DeletePayload>> {
  const named = namedTargets({ id: call.ids, path: call.path });

  // A path that can't be parsed was written wrong, so it refuses the call
  // before anything is looked up. One that parses but names the wrong kind of
  // thing skips only its own target.
  refuseUnparsableEntries(call.path, "path");

  return named.map((target) => resolveTarget(target, call.type));
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
  // Parsed once already by deleteTargets, which refused anything unparsable.
  const parsed = parseObjectPath(requestPath, "path", true);

  if (parsed.kind !== "take-lane") {
    return null;
  }

  const lane = LiveAPI.from(
    livePath.track(parsed.trackIndex).takeLane(parsed.laneIndex),
  );

  return lane.exists() ? { id: lane.id } : null;
}

/**
 * One named target: the object to delete, or why there is nothing to do.
 * @param named - The target, as the caller named it
 * @param type - Type of objects to delete
 * @returns The target
 */
function resolveTarget(
  named: NamedTarget,
  type: string,
): Target<DeletePayload> {
  const requestPath = named.param === "path" ? named.value : undefined;
  const lookup: IdLookup =
    requestPath == null
      ? { id: named.value }
      : (existingTakeLane(requestPath) ??
        resolvePathForType(type, requestPath));

  if (lookup.id == null) {
    return lookup.empty ? nothingThere(named) : { named, skip: lookup.reason };
  }

  const { id } = lookup;
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    return nothingThere(named);
  }

  const refusal = undeletable(object, type);

  if (refusal != null) {
    return { named, skip: refusal };
  }

  // Keyed by the object, so an id and a path naming one object are caught.
  return {
    named,
    key: object.id,
    data: { kind: "delete", id, object, requestPath },
  };
}

/**
 * A target with nothing there. It has no key: nothing is named twice that
 * isn't there.
 * @param named - The target, as the caller named it
 * @returns A target whose write does nothing
 */
function nothingThere(named: NamedTarget): Target<DeletePayload> {
  return { named, data: { kind: "nothing" } };
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
