// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { blankTargetIgnores } from "#src/tools/shared/validation/lists/target-lists.ts";
import { noteEntry } from "#src/tools/shared/validation/lists/named-targets.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type AppliedTarget,
  type Call,
  type Done,
  type PipelineResult,
  type Plan,
  type Step,
  type Superseded,
  type Target,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { deleteObjectByType } from "./helpers/delete-object-by-type.ts";
import {
  type DeletePayload,
  NOTHING_TO_DELETE,
  deleteTargets,
} from "./helpers/delete-targets.ts";
import {
  type DeleteArgs,
  type DeleteCall,
  parseDeleteCall,
} from "./helpers/parse-delete-call.ts";
import { positionalDeleteOrder } from "./helpers/positional-delete-order.ts";

/** What the call has to say about one target. */
export interface DeleteEntry {
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
  /** Why there was nothing left to delete, or what did not land. */
  detail?: string;
}

/** What one call shares between its targets. */
interface DeleteChecked {
  type: string;
  sent: DeleteCall["sent"];
  /** One object per track for the whole call, not per clip. Deleting a clip
   * never moves a track, so the one resolved first stays the right one. */
  tracks: Map<number, LiveAPI>;
}

/**
 * Deletes objects by ids and/or paths
 * @param args - The parameters
 * @param args.id - Comma-separated list of object IDs
 * @param args.ids - Hidden alias for id
 * @param args.path - Comma-separated paths naming what to delete
 * @param args.paths - Hidden alias for path
 * @param args.type - Type of objects to delete
 * @param ctx - Internal context object, for the request deadline
 * @returns One entry per target named, unwrapped when the call named one
 */
export function deleteObject(
  args: DeleteArgs,
  ctx: Partial<ToolContext> = {},
): PipelineResult<DeleteEntry> {
  // No hook awaits, so the answer is never a promise.
  return runWrite(DELETE_WRITE, args, ctx) as PipelineResult<DeleteEntry>;
}

const DELETE_WRITE: WriteSpec<
  DeleteArgs,
  DeleteCall,
  DeletePayload,
  DeleteChecked,
  DeleteEntry,
  string | undefined
> = {
  tool: "ppal-delete",
  words: { rerun: "target" },
  parse: parseDeleteCall,
  targets: deleteTargets,
  check: ({ type, sent }) => ({ type, sent, tracks: new Map() }),
  plan: planDeletes,
  write: deleteTarget,
  settle: settleDelete,
};

// --- Helpers below main export ---

/**
 * Decide the order to delete in, and take every address now: afterwards a path
 * names whatever slid into the slot. The caller's own spelling wins when they
 * gave one.
 * @param targets - The call's targets, in the order named
 * @param checked - The checked call
 * @param _call - The call's shared state (unused)
 * @param superseded - What later targets make of earlier ones
 * @returns The order to delete in, and each target's address
 */
function planDeletes(
  targets: Array<Target<DeletePayload>>,
  checked: DeleteChecked,
  _call: Call,
  superseded: Superseded,
): Plan<string | undefined> {
  const toDelete = targets.flatMap((target, index) =>
    target.data?.kind === "delete" && !superseded.unwritten.has(index)
      ? [{ index, data: target.data }]
      : [],
  );

  const each: Array<string | undefined> = [];

  for (const { index, data } of toDelete) {
    each[index] = data.requestPath ?? objectPathForApi(data.object);
  }

  return {
    order: positionalDeleteOrder(
      toDelete.map(({ index, data }) => ({ index, object: data.object })),
      checked.type,
    ),
    each,
  };
}

/**
 * Delete one target, and say what became of it.
 * @param target - The target
 * @param step - The call's state for this target
 * @returns The target's entry
 * @throws Error with the reason a target that is there wasn't deleted
 */
function deleteTarget(
  target: AppliedTarget<DeletePayload>,
  step: Step<DeleteChecked, string | undefined>,
): DeleteEntry {
  const { data, named } = target;

  if (data.kind === "nothing") {
    return noteEntry(named, NOTHING_TO_DELETE);
  }

  const { type, tracks } = step.checked;
  const { id, object } = data;
  const address = step.planned;
  const refusal = deleteObjectByType(type, id, object, tracks, (phrase) =>
    step.landed(phrase, { id, ...addressField(address, false) }),
  );

  if (refusal != null) {
    throw new Error(refusal);
  }

  // A drum pad is cleared, not removed, so it is still at its path.
  return { id, ...addressField(address, type !== "drum-pad") };
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

/**
 * Once every target has had its turn: say what the call dropped. Said last: a
 * refused call deleted nothing.
 * @param done - What the call did
 * @param call - The call's shared state
 */
function settleDelete(
  done: Done<DeletePayload, DeleteChecked, DeleteEntry>,
  call: Call,
): void {
  const { checked, entries } = done;

  for (const { param, why } of blankTargetIgnores(
    checked.sent,
    `${checked.type}s`,
    entries.length,
  )) {
    call.ignored(param, why);
  }
}
