// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `id` names one source or a list of them. A list runs the single-source logic
// once per source, in order, and concatenates — so the only thing to settle
// here is how one `toPath` is shared out.

import * as console from "#src/shared/max/v8-max-console.ts";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { pathEntries } from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  resolveClipDestinations,
  type ClipDestinations,
} from "../clip/duplicate-destination-helpers.ts";

/** One source's turn: which object to copy, and where its copies go. */
export interface SourceShare {
  /** Undefined only for a drum pad naming its source by path. */
  id: string | undefined;
  toPath: string | undefined;
  toSlot: string | undefined;
}

/** What a call needs to share its destinations out across its sources. */
interface SourcePlanArgs {
  id: string | undefined;
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
 * @param args.id - Source id(s), comma-separated for multiple
 * @param args.toPath - Destination path(s)
 * @param args.toSlot - Deprecated destination clip slot(s)
 * @param args.broadcasts - Whether the destination holds many objects
 * @returns One share per source, in the order `id` named them
 */
export function planSources({
  id,
  toPath,
  toSlot,
  broadcasts,
}: SourcePlanArgs): SourceShare[] {
  const ids = parseCommaSeparatedIds(id);

  // One source is the whole call: leave every param exactly as it arrived, so
  // nothing re-splits a list that was already going to be split downstream.
  if (ids.length <= 1) return [{ id, toPath, toSlot }];

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
 * @param hasArrangementParams - Whether arrangementStart or locator was given
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
  if (sources.length === 1) return copyOne(sources[0] as SourceShare, 0);

  return sources.flatMap((source, i) => {
    const result = copyOne(source, i);

    return Array.isArray(result) ? result : [result];
  });
}

// --- Helpers below main exports ---

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
      `duplicate: ${label} names ${entries.length} destination(s) for ${sources} sources, ` +
        `and each needs its own — the last ${sources - entries.length} source(s) were skipped`,
    );

    return entries;
  }

  const each = Math.floor(entries.length / sources);
  const spare = entries.length % sources;

  if (spare > 0) {
    console.warn(
      `duplicate: the last ${spare} ${label} destination(s) went unused — ` +
        `${sources} sources take ${each} each`,
    );
  }

  return Array.from({ length: sources }, (_, i) =>
    entries.slice(i * each, (i + 1) * each).join(","),
  );
}
