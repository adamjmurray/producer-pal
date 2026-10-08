// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A source with two or more copies on its own span is copied from a spare: a
// full copy of it, made before the first of them and deleted after the last
// (or by the end of the call). A spare Live won't delete stays, and an entry
// says so.

import { errorMessage } from "#src/shared/error-message.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type DuplicateRun,
  type LateCopy,
  type Spare,
} from "../duplicate-call-types.ts";
import { liveObject, trackFor } from "../duplicate-run.ts";
import { makeSpareCopy, removeSpareCopy } from "./spare-copy.ts";

/** A spare Live made, with the copies still to be made from it. */
type HeldSpare = Extract<Spare, { id: string }>;

/**
 * The spare to copy a source from, made the first time it is asked for.
 * @param run - The call's shared state
 * @param sourceId - The source clip's id
 * @param late - What the plan said of the source's copies on itself
 * @param index - The asking copy's place in the call
 * @returns The spare
 * @throws Error when no spare could be made; then no copy of the source that
 *   needs one is made either
 */
export function sourceSpare(
  run: DuplicateRun,
  sourceId: string,
  late: LateCopy,
  index: number,
): LiveAPI {
  const known = run.spares.get(sourceId);

  if (known != null) {
    if ("refused" in known) {
      throw new Error(known.refused);
    }

    return liveObject(run, known.id);
  }

  const trackIndex = liveObject(run, sourceId).trackIndex as number;
  const track = trackFor(run, trackIndex);
  let id: string;

  // Guard only the call that makes it: once it exists, it is recorded first.
  try {
    id = makeSpareCopy(track, sourceId, late.clearBeats, run.context);
  } catch (error) {
    const refused = `couldn't make a spare copy of the source clip to copy from: ${errorMessage(error)}`;

    run.spares.set(sourceId, { refused });

    throw new Error(refused, { cause: error });
  }

  run.spares.set(sourceId, { id, trackIndex, remaining: late.copies, index });
  // Not a clip the call changed: no entry reports on it.
  run.ledger.setAside(id);

  return liveObject(run, id);
}

/**
 * Say that a copy made from a source's spare has had its turn, whatever came of
 * it. The last one deletes the spare.
 * @param run - The call's shared state
 * @param sourceId - The source clip's id
 * @returns What to say if the spare could not be deleted, else undefined
 */
export function madeFromSpare(
  run: DuplicateRun,
  sourceId: string,
): string | undefined {
  // Only a copy that got its spare asks, so it is there.
  const spare = run.spares.get(sourceId) as HeldSpare;

  spare.remaining--;

  return spare.remaining > 0 ? undefined : removeSpare(run, sourceId, spare);
}

/**
 * Delete the spares whose copies never all got their turn (the call ran out of
 * time), once no more copies will be made.
 * @param run - The call's shared state
 * @returns For each spare Live would not delete, the place in the call of the
 *   entry to say so on, and what to say
 */
export function releaseSpares(
  run: DuplicateRun,
): Array<{ index: number; note: string }> {
  const left: Array<{ index: number; note: string }> = [];

  for (const [sourceId, spare] of run.spares) {
    if ("refused" in spare) {
      continue;
    }

    const note = removeSpare(run, sourceId, spare);

    if (note != null) {
      left.push({ index: spare.index, note });
    }
  }

  return left;
}

// --- Helpers below main exports ---

/**
 * @param run - The call's shared state
 * @param sourceId - The source clip's id
 * @param spare - Its spare
 * @returns What to say if the spare could not be deleted, else undefined
 */
function removeSpare(
  run: DuplicateRun,
  sourceId: string,
  spare: HeldSpare,
): string | undefined {
  run.spares.delete(sourceId);
  run.objects.delete(spare.id);

  if (removeSpareCopy(trackFor(run, spare.trackIndex), spare.id)) {
    run.ledger.unsetAside(spare.id);

    return undefined;
  }

  return `a spare copy of the source clip is still at ${targetLabel(LiveAPI.from(spare.id))}; delete it`;
}
