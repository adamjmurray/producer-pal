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
  type EntryWithDetail,
  appendDetail,
  joinDetails,
} from "#src/tools/shared/helpers/entry-details.ts";

/** What one target's update has to say beyond its own result. */
export interface TargetNotes {
  /** What the entry should say, in the order it was found out */
  said: string[];
  /** Params the call sent that did nothing here, so they stop counting as
   * work asked of the target */
  refused: string[];
  /** Nested lists none of whose writes landed. Said only when that leaves the
   * target with nothing, since the list's own entries already say it. */
  unlanded: string[];
  /** Set when the call changed the Set on the way to work that then failed (a
   * swapped or created instrument): a throw would claim nothing changed. */
  altered?: true;
}

/** One nested write's entry: a send, a param, an action. */
interface NestedEntry {
  ok?: false;
  detail?: string;
}

/**
 * The collector one target reports through.
 * @returns An empty collector
 */
export function newTargetNotes(): TargetNotes {
  return { said: [], refused: [], unlanded: [] };
}

/**
 * Note something the target's entry should say, where the work landed anyway.
 * @param notes - What the target has to say, added to; undefined warns instead
 * @param detail - What happened, as the entry will read it
 */
export function noteTarget(
  notes: TargetNotes | undefined,
  detail: string,
): void {
  if (notes == null) {
    console.warn(detail);
  } else {
    notes.said.push(detail);
  }
}

/**
 * Note params the call sent that did nothing to this target. Naming them is
 * what makes a refusal stick: a param the call sent counts as work asked of the
 * target, so an ignored one has to stop counting or the target looks updated.
 * @param notes - What the target has to say, added to; undefined warns instead
 * @param params - The params that did nothing
 * @param detail - What happened instead, as the entry will read it
 */
export function refuseTargetWork(
  notes: TargetNotes | undefined,
  params: readonly string[],
  detail: string,
): void {
  noteTarget(notes, detail);
  notes?.refused.push(...params);
}

/**
 * Mark that the call changed the Set for this target, so the target keeps its
 * entry even if nothing it asked for landed.
 * @param notes - What the target has to say; undefined when there's no entry
 */
export function noteSetAltered(notes: TargetNotes | undefined): void {
  if (notes != null) {
    notes.altered = true;
  }
}

/**
 * Count a nested list as refused when none of its writes landed, so a target
 * asked for nothing else is a skip that names each failure.
 * @param notes - What the target has to say, added to
 * @param params - The params that asked for these writes
 * @param noun - One write, singular ("send")
 * @param entries - Every write in the list, landed or not
 * @param name - How the detail names one entry
 */
export function refuseIfNoneLanded<T extends object>(
  notes: TargetNotes,
  params: readonly string[],
  noun: string,
  entries: readonly T[],
  name: (entry: T) => string,
): void {
  const failed = (entry: T): boolean => (entry as NestedEntry).ok === false;

  if (entries.length === 0 || !entries.every(failed)) {
    return;
  }

  const failures = entries.map(
    (entry) => `"${name(entry)}": ${(entry as NestedEntry).detail}`,
  );

  notes.refused.push(...params);
  notes.unlanded.push(`no ${noun} landed — ${failures.join("; ")}`);
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
export function reportTargetNotes<T extends EntryWithDetail>(
  entry: T,
  notes: TargetNotes,
  asked: object,
): T {
  const detail = joinDetails(notes.said);

  if (detail == null && notes.unlanded.length === 0) {
    return entry;
  }

  if (notes.altered !== true && !askedAnythingElse(asked, notes.refused)) {
    throw new Error(joinDetails([...notes.said, ...notes.unlanded]));
  }

  if (detail != null) {
    appendDetail(entry, detail);
  }

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
