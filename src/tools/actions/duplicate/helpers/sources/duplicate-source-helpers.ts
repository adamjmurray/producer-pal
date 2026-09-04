// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `id` and `path` each name one source or a list of them. A list runs the
// single-source logic once per source, in order, and concatenates — so the only
// thing to settle here is how one `toPath` is shared out.

import * as console from "#src/shared/max/v8-max-console.ts";
import { idPerPathForType } from "#src/tools/shared/validation/id-per-path.ts";
import { targetIds } from "#src/tools/shared/validation/lists/target-lists.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  resolveClipDestinations,
  type ClipDestinations,
} from "../clip/duplicate-destination-helpers.ts";

/** One source's turn: which object to copy, and where its copies go. */
export interface SourceShare {
  id: string;
  toPath: string | undefined;
  toSlot: string | undefined;
}

/** What a call needs to share its destinations out across its sources. */
interface SourcePlanArgs {
  type: string;
  id: string | undefined;
  path: string | undefined;
  toPath: string | undefined;
  toSlot: string | undefined;
  /**
   * Whether the destination holds many objects. A container — `t2`, `t2/l0`,
   * `t2/l+` — tells its copies apart by position, so every source can have the
   * whole list. A clip slot, device slot or drum pad holds exactly one, so the
   * list is shared out instead.
   */
  broadcasts: boolean;
}

/**
 * Splits a call into one turn per source.
 * @param args - The source and destination params as the tool received them
 * @param args.type - Object type to duplicate, which says how a path resolves
 * @param args.id - Source id(s), comma-separated for multiple
 * @param args.path - Source path(s), comma-separated for multiple
 * @param args.toPath - Destination path(s)
 * @param args.toSlot - Deprecated destination clip slot(s)
 * @param args.broadcasts - Whether the destination holds many objects
 * @returns One share per source, ids first, then the paths in order
 */
export function planSources({
  type,
  id,
  path,
  toPath,
  toSlot,
  broadcasts,
}: SourcePlanArgs): SourceShare[] {
  const ids = sourceIds(type, id, path);

  // One source is the whole call: leave the destinations exactly as they
  // arrived, so nothing re-splits a list that was already going to be split
  // downstream.
  if (ids.length <= 1) return [{ id: ids[0] as string, toPath, toSlot }];

  if (broadcasts) {
    return ids.map((sourceId) => ({ id: sourceId, toPath, toSlot }));
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
 * Warn when several sources all land on one named arrangement toPath. In this
 * mode toPath is broadcast whole to every source (see `planSources`) — never
 * split per source — so a toPath shared by 2+ sources always collides, at
 * every position it resolves to. A copy landing on an occupied span truncates
 * what is there, so the later sources sit on top of the earlier ones. This is
 * the collision duplicate-clip-order-helpers already reorders around for ONE
 * source's own copies — no source can see the others coming, so it is said
 * once here.
 *
 * An omitted toPath defaults each source to its own track, which is a genuine
 * row rather than a pile, so that case is left alone — and so is a toPath of
 * bare "[5|1]" coordinates, which says the same thing in the grammar.
 * @param sources - The sources this call is copying
 * @param destination - Where the copies land, when the type has a destination
 * @param clipDestinations - The destinations one toPath resolved to, for clips
 */
export function warnSharedArrangementDestination(
  sources: SourceShare[],
  destination: "session" | "arrangement" | undefined,
  clipDestinations: ClipDestinations | null,
): void {
  const first = sources[0];

  if (
    destination !== "arrangement" ||
    sources.length < 2 ||
    first?.toPath == null ||
    namesOwnLaneOnly(clipDestinations)
  ) {
    return;
  }

  if (sources.every((source) => source.toPath === first.toPath)) {
    console.warn(
      `${sources.length} clips duplicated to "${first.toPath}" at the same position - later ones will overwrite earlier ones`,
    );
  }
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
  if (sources.length === 1) return copyOne(sources[0] as SourceShare, 0);

  return sources.flatMap((source, i) => {
    const result = copyOne(source, i);

    return Array.isArray(result) ? result : [result];
  });
}

// --- Helpers below main exports ---

/**
 * Whether every destination is the source clip's own track, which each source
 * has one of. Nothing piles up, so there is nothing to warn about.
 * @param clipDestinations - The destinations one toPath resolved to
 * @returns True when no named track is in play
 */
function namesOwnLaneOnly(clipDestinations: ClipDestinations | null): boolean {
  const targets = clipDestinations?.arrangementTargets;

  return (
    targets != null &&
    targets.length > 0 &&
    targets.every((target) => target?.trackIndex == null)
  );
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
  if (entries.length === 0) return Array.from({ length: sources });

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
