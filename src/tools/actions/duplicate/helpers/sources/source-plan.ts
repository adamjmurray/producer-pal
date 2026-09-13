// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `id` and `path` each name one source or a list of them. A list runs the
// single-source logic once per source, in order, and concatenates — so the only
// thing to settle here is how the destinations are shared out.

import * as console from "#src/shared/max/v8-max-console.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { idPerPathForType } from "#src/tools/shared/validation/id-per-path.ts";
import {
  pairValues,
  type PairLabels,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { targetIds } from "#src/tools/shared/validation/lists/target-lists.ts";
import {
  pathEntries,
  pathNamesSomething,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  resolveClipDestinations,
  type ClipDestinations,
} from "../clip/clip-destinations.ts";

/** One source's turn: which object to copy, and where its copies go. */
export interface SourceShare {
  id: string;
  toPath: string | undefined;
  toSlot: string | undefined;
  /** This source's share of arrangementStart. */
  arrangementStart: string | undefined;
}

/** What a call needs to share its destinations out across its sources. */
interface SourcePlanArgs {
  type: string;
  id: string | undefined;
  path: string | undefined;
  toPath: string | undefined;
  toSlot: string | undefined;
  arrangementStart: string | undefined;
  /**
   * Whether the copies land on the arrangement, where a destination is a
   * position rather than a slot. Both spellings of one — a positioned `toPath`,
   * and a bare track with `arrangementStart` — pair across the sources the same
   * way.
   */
  onArrangement: boolean;
}

/**
 * Splits a call into one turn per source.
 * @param args - The source and destination params as the tool received them
 * @param args.type - Object type to duplicate, which says how a path resolves
 * @param args.id - Source id(s), comma-separated for multiple
 * @param args.path - Source path(s), comma-separated for multiple
 * @param args.toPath - Destination path(s)
 * @param args.toSlot - Deprecated destination clip slot(s)
 * @param args.arrangementStart - Position(s), already resolved to bar|beat
 * @param args.onArrangement - Whether the copies land on the arrangement
 * @returns One share per source, ids first, then the paths in order
 */
export function planSources({
  type,
  id,
  path,
  toPath,
  toSlot,
  arrangementStart,
  onArrangement,
}: SourcePlanArgs): SourceShare[] {
  const ids = sourceIds(type, id, path);

  // One source is the whole call: leave the destinations exactly as they
  // arrived, so nothing re-splits a list that was already going to be split
  // downstream.
  if (ids.length <= 1) {
    return [{ id: ids[0] as string, toPath, toSlot, arrangementStart }];
  }

  // toSlot only ever named a clip slot, so a call using it lands in the session
  // however the position params read — and shares its destinations out below.
  if (onArrangement && !pathNamesSomething(toSlot)) {
    return arrangementShares(ids, toPath, arrangementStart);
  }

  // toPath and toSlot can't both name a destination (resolveClipDestinations
  // refuses that), so at most one of these does any splitting.
  const paths = shareDestinations(toPath, ids.length, "toPath");
  const slots = shareDestinations(toSlot, ids.length, "toSlot");
  const shared = Math.min(paths.length, slots.length);

  // A source with no destination left has nowhere to copy to, so it drops out
  // rather than piling onto a slot another source already claimed.
  return ids.slice(0, shared).map((sourceId, i) => ({
    id: sourceId,
    toPath: paths[i],
    toSlot: slots[i],
    arrangementStart,
  }));
}

/**
 * Resolves where each source's clip copies go.
 *
 * Sources that name the same destination share one resolution, so the warnings
 * it raises — a clip slot that contradicts arrangementStart, an entry that
 * named nothing — are raised once for the call rather than once per source.
 * @param sources - The shares to resolve, in order
 * @param hasArrangementParams - Whether arrangementStart was given
 * @returns One destination set per source, in the same order
 */
export function resolveSourceClipDestinations(
  sources: SourceShare[],
  hasArrangementParams: boolean,
): ClipDestinations[] {
  const first = sources[0] as SourceShare;
  const same = sources.every(
    (source) =>
      source.toPath === first.toPath && source.toSlot === first.toSlot,
  );

  if (same) {
    const shared = resolveClipDestinations(
      first.toPath,
      first.toSlot,
      hasArrangementParams,
    );

    return sources.map(() => shared);
  }

  return sources.map((source) =>
    resolveClipDestinations(source.toPath, source.toSlot, hasArrangementParams),
  );
}

/**
 * Runs one source's copies at a time and concatenates them.
 *
 * A lone source keeps whatever shape its own branch chose — one object for one
 * copy, an array for a list — because that shape reports how many copies were
 * asked for, not how many landed.
 * @param sources - The shares to run, in order
 * @param copyOne - Makes one source's copies
 * @returns The copies, in source order
 */
export function collectSources(
  sources: SourceShare[],
  copyOne: (source: SourceShare, index: number) => object | object[],
): object | object[] {
  if (sources.length === 1) {
    return copyOne(sources[0] as SourceShare, 0);
  }

  return sources.flatMap((source, i) => {
    const result = copyOne(source, i);

    return Array.isArray(result) ? result : [result];
  });
}

// --- Helpers below main exports ---

/**
 * Shares an arrangement destination out across the sources: one entry covers
 * them all, a list gives one per source in order, and nothing cycles
 * (ADR-0031). Both params that can carry the destination pair the same way, so
 * `toPath: "t0[1|1],t0[17|1]"` and `toPath: "t0"` with
 * `arrangementStart: "1|1,17|1"` put the same source at the same bar.
 * @param ids - The sources, in call order
 * @param toPath - Destination path(s)
 * @param arrangementStart - Position(s), already resolved to bar|beat
 * @returns One share per source the destinations reached
 */
function arrangementShares(
  ids: string[],
  toPath: string | undefined,
  arrangementStart: string | undefined,
): SourceShare[] {
  const paths = perSource(pathEntries(toPath, "toPath"), ids.length, {
    param: "toPath",
    noun: "destination",
    item: "source",
    shortfall: "were not copied",
  });
  const starts = perSource(
    targetEntries(arrangementStart, "arrangementStart"),
    ids.length,
    {
      param: "arrangementStart",
      noun: "position",
      item: "source",
      shortfall: "were not copied",
    },
  );
  const shared = Math.min(paths.length, starts.length);

  return ids.slice(0, shared).map((sourceId, i) => ({
    id: sourceId,
    toPath: paths[i],
    toSlot: undefined,
    arrangementStart: starts[i],
  }));
}

/**
 * One list param's share per source, warning when the counts disagree.
 * @param entries - The param's entries, in call order
 * @param sources - How many sources the call copies
 * @param labels - What to call the param and its entries in a warning
 * @returns One entry per source the param reached, shorter when it ran out
 */
function perSource(
  entries: string[],
  sources: number,
  labels: PairLabels,
): (string | undefined)[] {
  // An unsent param reaches every source: a clip with no toPath lands on its
  // own track, and a position can come from toPath instead of arrangementStart.
  if (entries.length === 0) {
    return Array.from({ length: sources });
  }

  // A short list pads with nulls, and only at the end, so dropping them leaves
  // the sources it reached — the rest have nowhere to go.
  return pairValues(entries, sources, labels).filter((entry) => entry != null);
}

/**
 * The ids of the objects a call names, by id, by path, or both — they name
 * different objects, so they add up.
 *
 * A path that names nothing refuses the call. `delete` keeps such a miss and
 * reports the object undeleted, but a duplicate leaves copies behind, and every
 * one already made is something the caller has to clean up by hand before
 * retrying — so nothing starts until every source is known (ADR-0035).
 * @param type - Object type to duplicate, which says how a path resolves
 * @param id - Source id(s), comma-separated for multiple
 * @param path - Source path(s), comma-separated for multiple
 * @returns One id per source, ids first, then the paths in order
 */
function sourceIds(
  type: string,
  id: string | undefined,
  path: string | undefined,
): string[] {
  const resolved = targetIds({ id, path }, idPerPathForType(type));
  const paths = pathEntries(path, "path");
  const idCount = resolved.length - paths.length;
  const missing = resolved.flatMap((entry, i) =>
    entry == null ? [paths[i - idCount] as string] : [],
  );

  if (missing.length > 0) {
    throw new Error(
      `nothing to duplicate at path ${missing
        .map((entry) => `"${entry}"`)
        .join(", ")}`,
    );
  }

  return resolved as string[];
}

/**
 * Shares a slot-shaped destination list out across the sources: each source
 * takes the same number of destinations, in the order they were written.
 *
 * A destination that holds one object can't be broadcast — every source after
 * the first would overwrite the one before it — so the list has to name as many
 * places as the call makes copies. That is already the rule for one source; a
 * source list only makes it bite more often.
 * @param value - The raw destination param, comma-separated for multiple
 * @param sources - How many sources the call copies
 * @param label - Param name for messages
 * @returns One share per source, or fewer when there weren't enough to go round
 */
function shareDestinations(
  value: string | undefined,
  sources: number,
  label: string,
): (string | undefined)[] {
  const entries = pathEntries(value, label);

  // Nothing to share out. The branch decides whether it can do without one.
  if (entries.length === 0) {
    return Array.from({ length: sources });
  }

  if (entries.length < sources) {
    console.warn(
      `${label} names ${entries.length} destination(s) for ${sources} sources, ` +
        `and each needs its own — the last ${sources - entries.length} source(s) were skipped`,
    );

    return entries;
  }

  const each = Math.floor(entries.length / sources);
  const spare = entries.length % sources;

  if (spare > 0) {
    console.warn(
      `the last ${spare} ${label} destination(s) went unused — ` +
        `${sources} sources take ${each} each`,
    );
  }

  return Array.from({ length: sources }, (_, i) =>
    entries.slice(i * each, (i + 1) * each).join(","),
  );
}
