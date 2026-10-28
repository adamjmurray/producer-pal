// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// One pass over a path param, for every kind of object a path can name. An
// entry that names nothing resolves to the reason it didn't, so the caller can
// put it in the target's result entry.

import { errorMessage } from "#src/shared/error-message.ts";

/**
 * What a path was meant to find ("clip"), the param it came from, and the
 * path as written.
 */
export interface PathTarget {
  noun: string;
  label: string;
  entry: string;
  /** Which tool makes one, for a path naming a spot nothing is at yet. */
  advice?: string;
}

/**
 * What one path entry named: an object's id, or the reason it named none.
 *
 * `empty` separates a place that could hold something and doesn't from a path
 * that names the wrong kind of thing. A delete is already done in the first
 * case and refused in the second.
 */
export type IdLookup =
  | { id: string; reason?: undefined; empty?: undefined }
  | { id: null; reason: string; empty: boolean };

/** One entry of a path list, as the caller wrote it, and what it named. */
export type PathResolution =
  | { entry: string; id: string; reason?: undefined; empty?: undefined }
  | { entry: string; id: null; reason: string; empty: boolean };

/**
 * One entry's resolution, tagged with the entry that asked for it. A resolver
 * throws for a path naming the wrong kind of thing, which is not the same as a
 * place standing empty — so one entry's bad spelling costs its own slot and not
 * the batch.
 * @param entry - One path, as the caller wrote it
 * @param resolve - Gives the id the entry names, or the reason there is none
 * @returns What the entry named
 */
export function resolvePathEntry(
  entry: string,
  resolve: (entry: string) => IdLookup,
): PathResolution {
  try {
    const lookup = resolve(entry);

    return lookup.id == null
      ? { entry, id: null, reason: lookup.reason, empty: lookup.empty }
      : { entry, id: lookup.id };
  } catch (error) {
    return { entry, id: null, reason: errorMessage(error), empty: false };
  }
}

/**
 * The id of what a path found, or a word naming what's missing. The reason
 * names what was looked for, so the model learns more than that the path was
 * empty.
 * @param object - What the path resolved to, or null when it named no place
 * @param target - What was looked for, and where the path came from
 * @returns The id, or the reason nothing is there
 */
export function existingId(
  object: LiveAPI | null,
  target: PathTarget,
): IdLookup {
  if (object?.exists()) {
    return { id: object.id };
  }

  return nothingThere(
    `no ${target.noun} at ${target.label} "${target.entry}"` +
      (target.advice == null ? "" : `; ${target.advice}`),
  );
}

/**
 * Nothing is at a path that could have held something — an empty place, not a
 * path naming the wrong kind of thing.
 * @param reason - What was looked for and where
 * @returns The lookup saying so
 */
export function nothingThere(reason: string): IdLookup {
  return { id: null, reason, empty: true };
}

/**
 * The id a lookup found, throwing its reason when it found none — for a caller
 * whose failed target has a result entry to land the reason in.
 * @param lookup - What one path entry named
 * @returns The id
 * @throws Error carrying the reason there is none
 */
export function foundId(lookup: IdLookup): string {
  if (lookup.id == null) {
    throw new Error(lookup.reason);
  }

  return lookup.id;
}
