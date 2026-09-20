// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What one target's update has to say, for its own result entry (ADR-0042).
// The helpers that find out collect it here and the loop that wrote the entry
// puts it on. A caller with no entry to put it on passes nothing, and the note
// goes to the Max console instead.

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type EntryWithReason,
  appendReason,
  joinReasons,
} from "#src/tools/shared/helpers/entry-reasons.ts";

/** What one target's update has to say beyond its own result. */
export interface TargetNotes {
  /** What the entry should say, in the order it was found out */
  said: string[];
  /** Params the call sent that did nothing here, so they stop counting as
   * work asked of the target */
  refused: string[];
}

/**
 * The collector one target reports through.
 * @returns An empty collector
 */
export function newTargetNotes(): TargetNotes {
  return { said: [], refused: [] };
}

/**
 * Note something the target's entry should say, where the work landed anyway.
 * @param notes - What the target has to say, added to; undefined warns instead
 * @param reason - What happened, as the entry will read it
 */
export function noteTarget(
  notes: TargetNotes | undefined,
  reason: string,
): void {
  if (notes == null) {
    console.warn(reason);
  } else {
    notes.said.push(reason);
  }
}

/**
 * Note params the call sent that did nothing to this target. Naming them is
 * what makes a refusal stick: a param the call sent counts as work asked of the
 * target, so an ignored one has to stop counting or the target looks updated.
 * @param notes - What the target has to say, added to; undefined warns instead
 * @param params - The params that did nothing
 * @param reason - What happened instead, as the entry will read it
 */
export function refuseTargetWork(
  notes: TargetNotes | undefined,
  params: readonly string[],
  reason: string,
): void {
  noteTarget(notes, reason);
  notes?.refused.push(...params);
}

/**
 * Put everything a target's update had to say onto its entry.
 * @param entry - The target's entry, added to in place
 * @param notes - What the target has to say
 * @param asked - What the call asked of this target
 * @returns The entry
 * @throws Error when the refusals were everything the call asked, so nothing
 *   landed and the entry is a skip (a lone target throws outright)
 */
export function reportTargetNotes<T extends EntryWithReason>(
  entry: T,
  notes: TargetNotes,
  asked: object,
): T {
  const reason = joinReasons(notes.said);

  if (reason == null) {
    return entry;
  }

  if (!askedAnythingElse(asked, notes.refused)) {
    throw new Error(reason);
  }

  appendReason(entry, reason);

  return entry;
}

/**
 * Whether the call asked this target for anything beyond the refused params.
 * Read off the args themselves, so a param added later counts as work by
 * default instead of quietly turning a hit into a skip. `force` never does: it
 * modifies a `params` write rather than asking for anything.
 * @param asked - What the call asked of this target
 * @param refused - The params that did nothing to it
 * @returns True when something else was asked for
 */
function askedAnythingElse(asked: object, refused: string[]): boolean {
  return Object.entries(asked).some(
    ([key, value]: [string, unknown]) =>
      key !== "force" && isParamSent(value) && !refused.includes(key),
  );
}

/**
 * Whether the call actually asked for this param.
 * @param value - Parameter value
 * @returns True unless it is absent or an empty list
 */
export function isParamSent(value: unknown): boolean {
  return value != null && !(Array.isArray(value) && value.length === 0);
}
