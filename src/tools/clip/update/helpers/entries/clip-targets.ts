// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The clips a call names, and what the result says where one of them got no
// update. N targets named, N entries back, in the order named: a target the
// call couldn't carry out keeps its slot as a skip, and one whose work had
// already happened keeps it as a normal entry with a reason (ADR-0042).

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { appendReason } from "./clip-reasons.ts";
import { clipIdAtPath } from "#src/tools/clip/helpers/clip-path-lookup.ts";
import {
  namedIdParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import { resolvePathEntry } from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import {
  namedTargets,
  skipEntry,
  type NamedTarget,
  type TargetSkip,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { type TargetParams } from "#src/tools/shared/validation/lists/target-lists.ts";

/** One entry of an update-clip result: a clip, or the target standing in for one. */
export type ClipEntry = ClipResult | TargetSkip;

/**
 * The entry each target with no clip of its own contributes, by its place in
 * the call.
 */
export type UnusedTargets = Map<number, ClipEntry>;

/** The targets a call named, and the clips they resolved to. */
export interface ClipTargets {
  /** The targets, in the order the call named them. */
  named: NamedTarget[];
  /** One id per target, null where the target named no clip. */
  ids: Array<string | null>;
  /** The entries the targets that named no clip leave behind. */
  unused: UnusedTargets;
}

/**
 * The clips a call names, in the order it names them, each target keeping its
 * place whether or not it found a clip. A path that names no clip reports it
 * here instead of warning: its slot in the result is where the reason belongs.
 * @param targets - The call's id/ids and path/paths params
 * @returns The targets, the ids they found, and the entries for the ones that found none
 */
export function resolveClipTargets(targets: TargetParams): ClipTargets {
  const named = namedTargets({
    id: namedIdParam(targets.id, targets.ids, "ids"),
    path: namedPathParam(targets.path, targets.paths),
  });
  const unused: UnusedTargets = new Map();
  const ids = named.map((target, slot) => {
    if (target.param === "id") {
      return target.value;
    }

    const lookup = resolvePathEntry(target.value, (entry) =>
      clipIdAtPath(entry, "path"),
    );

    if (lookup.id == null) {
      refuseTarget(unused, named, slot, lookup.reason);
    }

    return lookup.id;
  });

  return { named, ids, unused };
}

/**
 * Nothing was done for this target, so its slot says why.
 * @param unused - The entries for targets with no clip, added to
 * @param named - The targets, in the order the call named them
 * @param slot - The target's place in the call
 * @param reason - Why it got no update, in the words a single target would throw
 */
export function refuseTarget(
  unused: UnusedTargets,
  named: NamedTarget[],
  slot: number,
  reason: string,
): void {
  unused.set(slot, skipEntry(named[slot] as NamedTarget, reason));
}

/**
 * The clips each target's results belong to, assembled back into call order.
 *
 * A target can answer with more than one clip — a split cuts one into several.
 * Where one of its pieces answered and another didn't, the one that didn't says
 * so on the first entry rather than disappearing, and a target that answered
 * with nothing at all still gets an entry: one target is never no entries.
 * @param named - The targets, in the order the call named them
 * @param unused - The entries for the targets that got no clip of their own
 * @param resultsPerSlot - Each target's results, by its place in the call
 * @returns The result entries, in call order
 */
export function clipEntriesInCallOrder(
  named: NamedTarget[],
  unused: UnusedTargets,
  resultsPerSlot: Map<number, ClipResult[]>,
): ClipEntry[] {
  return named.flatMap((target, slot) => {
    const results = resultsPerSlot.get(slot) ?? [];
    const spare = unused.get(slot);

    if (results.length === 0) {
      return (
        spare ?? skipEntry(target, "not updated: no clip was left to update")
      );
    }

    if (spare != null && "reason" in spare && spare.reason != null) {
      appendReason(results[0] as ClipResult, spare.reason);
    }

    return results;
  });
}

/**
 * The reason a lone target that got nothing done throws with, since there is no
 * list for its entry to hold a place in.
 * @param entries - The call's result entries, in call order
 * @returns The reason, or null when the call named more than one target or did its work
 */
export function loneRefusal(entries: ClipEntry[]): string | null {
  const [only] = entries;

  return entries.length === 1 && only != null && "ok" in only
    ? only.reason
    : null;
}
