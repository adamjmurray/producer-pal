// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Assembling the objects a call names, when it can name them two ways at once.
//
// `id` and `path` name different objects and add up, so the targets are their
// concatenation and the count is their sum. Comparing the two to each other
// would refuse a call naming two of each.

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  namedIdParam,
  namedPathParam,
  paramNamesSomething,
  targetEntries,
} from "#src/tools/shared/utils.ts";
import {
  countListEntries,
  countPathEntries,
} from "#src/tools/shared/validation/lists/list-lengths.ts";

/** The four ways a call names what to act on. */
export interface TargetParams {
  id?: string | null;
  ids?: string | null;
  path?: string | null;
  paths?: string | null;
}

/** Resolves a path list to one id per entry, null where a path named none. */
export type IdPerPath = (paths: string) => Array<string | null>;

/**
 * How many objects a call names, without looking any of them up. Lists are
 * checked before anything touches Live, so this counts entries.
 * @param args - The call's id/ids and path/paths params
 * @returns The number of targets named
 */
export function targetCount(args: TargetParams): number {
  return (
    countListEntries(namedIdParam(args.id, args.ids, "ids")) +
    countPathEntries(namedPathParam(args.path, args.paths))
  );
}

/**
 * The param name to report a target-count mismatch against: whichever of
 * `id`/`ids` or `path`/`paths` the call actually sent, by its canonical name.
 * The alias only ever stands in for its canonical, so a caller never sees it
 * named back.
 * @param args - The call's id/ids and path/paths params
 * @returns "id", "path", or "id and path" when both sides were sent
 */
export function targetParamLabel(args: TargetParams): string {
  const named = paramNamesSomething(args.id) || paramNamesSomething(args.ids);
  const pathed =
    paramNamesSomething(args.path) || paramNamesSomething(args.paths);

  if (named && pathed) {
    return "id and path";
  }

  if (named) {
    return "id";
  }

  if (pathed) {
    return "path";
  }

  return "id and path";
}

/**
 * The ids a call names, ids first, keeping one slot per entry so a caller
 * pairing them against another list keeps its positions.
 * @param args - The call's id/ids and path/paths params
 * @param idPerPath - Resolves the path list for this kind of object
 * @returns One id per target, null where a path named nothing
 */
export function targetIds(
  args: TargetParams,
  idPerPath: IdPerPath,
): Array<string | null> {
  const named = namedIdParam(args.id, args.ids, "ids");
  const paths = namedPathParam(args.path, args.paths);

  // An id that parses to nothing gets its own word even when path carries the
  // call: the combined list is still non-empty, so nothing else would notice
  // that the ids the caller asked for dropped out.
  return [
    ...targetEntries(named, "id"),
    ...(paths == null ? [] : idPerPath(paths)),
  ];
}

/** One param naming a target, by the name the caller would have written. */
export interface ParamSpelling {
  name: string;
  value: string | null | undefined;
}

/** One of the two ways to name a target, by every spelling it accepts. */
interface TargetSide {
  /** Each spelling of this side, canonical first */
  spellings: ParamSpelling[];
}

/**
 * Warn when one of the two ways to name a target arrived blank and the other
 * one carried the call.
 *
 * A blank reads as unset (ADR-0029), so the call still runs on whichever param
 * named something — and nothing in the result would say the other one was
 * dropped. It is a claim about what the call did, not about what it was given,
 * so the caller says how many targets resolved and nothing is said when none
 * did — a call that was refused, or whose paths found nothing, has no business
 * reporting which param named its targets.
 * @param targets - The call's id/ids and path/paths params
 * @param objects - What this tool's targets are, plural ("clips")
 * @param resolved - How many targets the call ended up with
 * @param idAlias - A tool's own spelling of `id` ("clipId"), where it has one
 */
export function warnBlankTarget(
  targets: TargetParams,
  objects: string,
  resolved: number,
  idAlias?: ParamSpelling,
): void {
  if (resolved === 0) {
    return;
  }

  const idSide: TargetSide = {
    spellings: [
      { name: "id", value: targets.id },
      { name: "ids", value: targets.ids },
      ...(idAlias == null ? [] : [idAlias]),
    ],
  };
  const pathSide: TargetSide = {
    spellings: [
      { name: "path", value: targets.path },
      { name: "paths", value: targets.paths },
    ],
  };

  warnBlankSide(idSide, pathSide, objects);
  warnBlankSide(pathSide, idSide, objects);
}

/**
 * Warn when `blank` named nothing because it arrived blank, and `carrying`
 * named the targets in its place. Both are reported by the spelling the caller
 * actually wrote, which for either side may be an alias.
 * @param blank - The side that may have arrived blank
 * @param carrying - The side that may have named the targets
 * @param objects - What this tool's targets are, plural
 */
function warnBlankSide(
  blank: TargetSide,
  carrying: TargetSide,
  objects: string,
): void {
  if (spelling(blank, paramNamesSomething) != null) {
    return;
  }

  const carried = spelling(carrying, paramNamesSomething);
  const dropped = spelling(blank, isBlank);

  if (carried == null || dropped == null) {
    return;
  }

  console.warn(`blank ${dropped} ignored — "${carried}" names the ${objects}`);
}

/**
 * Which of a side's spellings the test holds for, canonical first.
 * @param side - Every param naming this side
 * @param matches - What the spelling has to be
 * @returns The param name to report, or null when none matches
 */
function spelling(
  side: TargetSide,
  matches: (value: string | null | undefined) => boolean,
): string | null {
  return side.spellings.find(({ value }) => matches(value))?.name ?? null;
}

/**
 * Blank, not absent: the caller sent the param with nothing in it. Kept apart
 * from `paramNamesSomething` on purpose — a value it rejects for another reason
 * ("null") already has its own warning, and reporting it here would repeat it.
 * @param value - The param as the caller sent it
 * @returns True when the value is a string with nothing in it
 */
function isBlank(value: string | null | undefined): boolean {
  return value?.trim() === "";
}
