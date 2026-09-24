// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `id` and `path` each name one source or a list of them. A list runs the
// single-source logic once per source, in order, and concatenates — so the only
// thing to settle here is how the destinations are shared out.

import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { idPerPathForType } from "#src/tools/shared/validation/id-per-path.ts";
import {
  requireDestinationPerSource,
  requireSameLength,
} from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  namedTargets,
  type NamedTarget,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  targetIds,
  type IdPerPath,
} from "#src/tools/shared/validation/lists/target-lists.ts";
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
  /** The source as the caller named it, for an entry with no destination to
   * name. */
  named: NamedTarget;
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
  /** The param the caller wrote the positions in, for an error message: a
   * scene's toPath folds onto arrangementStart. Defaults to arrangementStart. */
  startParam?: string;
  /**
   * Whether the copies land on the arrangement, where a destination is a
   * position rather than a slot. Both spellings — a positioned `toPath`, and a
   * bare track with `arrangementStart` — pair across the sources the same way.
   */
  onArrangement: boolean;
  /** How a `path` entry resolves, when the type's own lookup isn't it: a track
   * copied onto a take lane takes a lane source too. */
  idPerPath?: IdPerPath;
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
 * @param args.startParam - The param the caller wrote the positions in
 * @param args.onArrangement - Whether the copies land on the arrangement
 * @param args.idPerPath - Path lookup to use instead of the type's own
 * @returns One share per source, ids first, then the paths in order
 */
export function planSources({
  type,
  id,
  path,
  toPath,
  toSlot,
  arrangementStart,
  startParam = "arrangementStart",
  onArrangement,
  idPerPath,
}: SourcePlanArgs): SourceShare[] {
  const sources = sourceTargets(type, id, path, idPerPath);

  // One source is the whole call: leave the destinations exactly as they
  // arrived, so nothing re-splits a list that was already going to be split
  // downstream.
  if (sources.length <= 1) {
    return [
      { ...(sources[0] as SourceTarget), toPath, toSlot, arrangementStart },
    ];
  }

  // The params that named the sources, for an error about how many there are.
  const named = [...new Set(sources.map((source) => source.named.param))].join(
    "/",
  );

  // toSlot only ever named a clip slot, so a clip call using it lands in the
  // session however the position params read — and shares its destinations out
  // below. Other types ignore it.
  if (onArrangement && (type !== "clip" || !pathNamesSomething(toSlot))) {
    return arrangementShares(
      sources,
      toPath,
      { value: arrangementStart, param: startParam },
      named,
    );
  }

  // toPath and toSlot can't both name a destination (resolveClipDestinations
  // refuses that), so at most one of these does any splitting.
  const paths = shareDestinations(toPath, sources, "toPath", named);
  const slots = shareDestinations(toSlot, sources, "toSlot", named);

  return sources.map((source, i) => ({
    ...source,
    toPath: paths[i],
    toSlot: slots[i],
    arrangementStart,
  }));
}

/**
 * Resolves where each source's clip copies go.
 *
 * Sources naming the same destination share one resolution, so the warnings it
 * raises are raised once for the call rather than once per source.
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

// --- Helpers below main exports ---

/** A source the call named, once its id is known. */
interface SourceTarget {
  id: string;
  named: NamedTarget;
}

/**
 * Shares an arrangement destination out across the sources: one entry covers
 * them all, a list gives one per source in order, and nothing cycles
 * (ADR-0031). Both params that can carry it pair the same way, so
 * `toPath: "t0[1|1],t0[17|1]"` matches `toPath: "t0"` with `"1|1,17|1"`.
 * @param sources - The sources, in call order
 * @param toPath - Destination path(s)
 * @param start - Position(s), already resolved to bar|beat, and the param the
 * caller wrote them in
 * @param start.value - The positions
 * @param start.param - The param's name, for an error message
 * @param named - The params that named the sources, for an error message
 * @returns One share per source
 */
function arrangementShares(
  sources: SourceTarget[],
  toPath: string | undefined,
  start: { value: string | undefined; param: string },
  named: string,
): SourceShare[] {
  const count = { param: named, count: sources.length };
  const paths = perSource(pathEntries(toPath, "toPath"), "toPath", count);
  const starts = perSource(
    targetEntries(start.value, start.param),
    start.param,
    count,
  );

  return sources.map((source, i) => ({
    ...source,
    toPath: paths[i],
    toSlot: undefined,
    arrangementStart: starts[i],
  }));
}

/**
 * One list param's share per source: one entry covers them all, a list names
 * one each, and any other count is refused. An arrangement position holds any
 * number of clips, so a lone entry broadcasts here where a slot's can't.
 * @param entries - The param's entries, in call order
 * @param param - The param's name, for an error message
 * @param sources - What named the sources, and how many there are
 * @returns One entry per source
 */
function perSource(
  entries: string[],
  param: string,
  sources: { param: string; count: number },
): (string | undefined)[] {
  // An unsent param reaches every source: a clip with no toPath lands on its
  // own track, and a position can come from toPath instead of arrangementStart.
  if (entries.length === 0) {
    return Array.from({ length: sources.count });
  }

  requireSameLength({ param, count: entries.length }, sources);

  return entries.length === 1
    ? Array.from({ length: sources.count }, () => entries[0])
    : entries;
}

/**
 * The objects a call names, by id, by path, or both — they name different
 * objects, so they add up. Each keeps the spelling the caller wrote, which is
 * how an entry names a source that has no destination of its own.
 *
 * A path that names nothing refuses the call. `delete` reports such a miss as
 * undeleted, but a duplicate leaves copies behind for the caller to clean up by
 * hand, so nothing starts until every source is known (ADR-0035).
 * @param type - Object type to duplicate, which says how a path resolves
 * @param id - Source id(s), comma-separated for multiple
 * @param path - Source path(s), comma-separated for multiple
 * @param lookup - Path lookup to use instead of the type's own
 * @returns One entry per source, ids first, then the paths in order
 */
function sourceTargets(
  type: string,
  id: string | undefined,
  path: string | undefined,
  lookup: IdPerPath = idPerPathForType(type),
): SourceTarget[] {
  const named = namedTargets({ id, path });
  const resolved = targetIds({ id, path }, lookup);
  const missing = resolved.flatMap((entry, i) =>
    entry == null ? [(named[i] as NamedTarget).value] : [],
  );

  if (missing.length > 0) {
    throw new Error(
      `nothing to duplicate at path ${missing
        .map((entry) => `"${entry}"`)
        .join(", ")}`,
    );
  }

  return resolved.map((entry, i) => ({
    id: entry as string,
    named: named[i] as NamedTarget,
  }));
}

/**
 * Shares a slot-shaped destination list out across the sources: each source
 * takes the same number of destinations, in the order they were written.
 *
 * A destination that holds one object can't be broadcast — the next source
 * would overwrite the last — so a list that doesn't divide evenly is refused
 * before the first copy, which the caller would have to undo by hand
 * (ADR-0035).
 * @param value - The raw destination param, comma-separated for multiple
 * @param sources - The sources, in call order
 * @param label - Param name for messages
 * @param named - The params that named the sources, for an error message
 * @returns One share per source
 */
function shareDestinations(
  value: string | undefined,
  sources: SourceTarget[],
  label: string,
  named: string,
): (string | undefined)[] {
  const entries = pathEntries(value, label);

  // Nothing to share out. The branch decides whether it can do without one.
  if (entries.length === 0) {
    return Array.from({ length: sources.length });
  }

  requireDestinationPerSource(
    { param: label, count: entries.length },
    { param: named, count: sources.length },
  );

  const each = entries.length / sources.length;

  return Array.from({ length: sources.length }, (_, i) =>
    entries.slice(i * each, (i + 1) * each).join(","),
  );
}
