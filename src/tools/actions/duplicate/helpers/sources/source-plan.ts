// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `id` and `path` each name one source or a list of them. A list runs the
// single-source logic once per source, in order, and concatenates — so the only
// thing to settle here is how the destinations are shared out. One source takes
// any number; several take one each, in order.

import { errorMessage } from "#src/shared/error-message.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { resolvePathForType } from "#src/tools/shared/validation/id-per-path.ts";
import { typeMismatch } from "#src/tools/shared/validation/id-validation.ts";
import {
  requireDestinationPerSource,
  requireSameLength,
} from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  namedTargets,
  type NamedTarget,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { type PathResolution } from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import {
  pathEntries,
  pathNamesSomething,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  destinationLane,
  loneToPath,
  pathCarriesPosition,
} from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  resolveClipDestinations,
  type ClipDestinations,
} from "../clip/clip-destinations.ts";
import { regularTrackIndex } from "./duplicate-track.ts";

/** One source's turn: which object to copy, and where its copies go. */
export interface SourceShare {
  id: string;
  /** The source as the caller named it, for an entry with no destination to
   * name. */
  named: NamedTarget;
  /** Why nothing can be copied from it: every copy it was to make is a skip. */
  skip?: string;
  toPath: string | undefined;
  toSlot: string | undefined;
  /** This source's share of arrangementStart. */
  arrangementStart: string | undefined;
}

/** How a source is found and vetted: its path entries, and what an id is. */
export interface SourceLookup {
  /** What one `path` entry names */
  resolvePath: (entry: string) => PathResolution;
  /** Why an id can't be a source, or null when it can */
  problem: (id: string) => string | null;
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
  /** How a source resolves, when the type's own lookup isn't it: a track
   * copied onto a take lane takes a lane source too. */
  lookup?: SourceLookup;
  /** Looks an object up, for a call that keeps the ones it has found */
  objectOf?: (id: string) => LiveAPI;
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
 * @param args.lookup - Source lookup to use instead of the type's own
 * @param args.objectOf - Looks an object up, for a call that keeps the ones
 *   it has found
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
  lookup,
  objectOf,
}: SourcePlanArgs): SourceShare[] {
  const sources = sourceTargets(id, path, lookup ?? typeLookup(type, objectOf));

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
      { value: arrangementStart, param: startParam, isScene: type === "scene" },
      named,
    );
  }

  // toPath and toSlot can't both name a destination (resolveClipDestinations
  // refuses that), so at most one of these does any splitting.
  const count = { param: named, count: sources.length };
  const paths = destinationShares(
    pathEntries(toPath, "toPath"),
    "toPath",
    count,
  );
  const slots = destinationShares(
    pathEntries(toSlot, "toSlot"),
    "toSlot",
    count,
  );

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

  // Each share resolves as part of the whole list, as one source's would: a
  // slot beside an arrangement entry is refused, and a track beside a
  // positioned entry needs its own position.
  const beside = {
    arrangement:
      hasArrangementParams &&
      sources.some((source) => namesArrangementEntry(source.toPath)),
    position: sources.some((source) => pathCarriesPosition(source.toPath)),
  };

  return sources.map((source) =>
    resolveClipDestinations(
      source.toPath,
      source.toSlot,
      hasArrangementParams,
      beside,
    ),
  );
}

// --- Helpers below main exports ---

/** A source the call named, once its id is known. */
type SourceTarget = Pick<SourceShare, "id" | "named" | "skip">;

/**
 * Shares an arrangement destination out across the sources. A clip's
 * arrangementStart is a position only, so one covers every source; a scene
 * copy spans every track, so its positions are destinations and pair one per
 * scene — and so do a clip's when one track is the whole toPath.
 * @param sources - The sources, in call order
 * @param toPath - Destination path(s)
 * @param start - Position(s), already resolved to bar|beat, the param the
 * caller wrote them in, and whether the sources are scenes
 * @param start.value - The positions
 * @param start.param - The param's name, for an error message
 * @param start.isScene - Whether the sources are scenes
 * @param named - The params that named the sources, for an error message
 * @returns One share per source
 */
function arrangementShares(
  sources: SourceTarget[],
  toPath: string | undefined,
  start: { value: string | undefined; param: string; isScene: boolean },
  named: string,
): SourceShare[] {
  const count = { param: named, count: sources.length };
  const paths = pathEntries(toPath, "toPath");
  const startEntries = targetEntries(start.value, start.param);
  const lone = loneToPath(paths);
  // A bare position lands each clip on its own track; a lone track or take
  // lane lands them apart when the positions pair one per source.
  const covers =
    lone.bare || (lone.trackOrLane && startEntries.length > 1)
      ? Array.from({ length: sources.length }, () => paths[0])
      : null;
  const destinations =
    covers ??
    destinationShares(
      paths,
      "toPath",
      count,
      lone.trackOrLane
        ? 'Drop toPath to keep each clip\'s own track, or name one track per clip ("t2,t3").'
        : "A bare [5|1] keeps each clip on its own track.",
    );
  const starts =
    start.isScene || lone.trackOrLane
      ? destinationShares(startEntries, start.param, count)
      : positionShares(startEntries, start.param, count);

  return sources.map((source, i) => ({
    ...source,
    toPath: destinations[i],
    toSlot: undefined,
    arrangementStart: starts[i],
  }));
}

/**
 * Whether a toPath names a spot on the arrangement: any entry that isn't a clip
 * slot, a bare `[5|1]` included.
 * @param toPath - One source's destination path(s)
 * @returns True when some entry isn't a clip slot
 */
function namesArrangementEntry(toPath: string | undefined): boolean {
  return pathEntries(toPath, "toPath").some(
    (entry) => destinationLane(entry, "toPath")?.kind !== "slot",
  );
}

/**
 * A clip position list's share per source: one entry covers them all, a list
 * names one each, and any other count is refused.
 * @param entries - The param's entries, in call order
 * @param param - The param's name, for an error message
 * @param sources - What named the sources, and how many there are
 * @returns One entry per source
 */
function positionShares(
  entries: string[],
  param: string,
  sources: { param: string; count: number },
): (string | undefined)[] {
  // An unsent param reaches every source: a position can come from toPath.
  if (entries.length === 0) {
    return Array.from({ length: sources.count });
  }

  requireSameLength({ param, count: entries.length }, sources);

  return entries.length === 1
    ? Array.from({ length: sources.count }, () => entries[0])
    : entries;
}

/**
 * A destination list's share per source: one each, in order. Refused before
 * the first copy otherwise, which the caller would have to undo by hand.
 * @param entries - The destination param's entries, in call order
 * @param param - The param's name, for an error message
 * @param sources - What named the sources, and how many there are
 * @param hint - A sentence for the error, naming another way out
 * @returns One entry per source, all undefined when the param wasn't sent
 */
function destinationShares(
  entries: string[],
  param: string,
  sources: { param: string; count: number },
  hint?: string,
): (string | undefined)[] {
  // Nothing to share out. The branch decides whether it can do without one.
  if (entries.length === 0) {
    return Array.from({ length: sources.count });
  }

  requireDestinationPerSource({ param, count: entries.length }, sources, hint);

  return entries;
}

/**
 * The objects a call names, by id, by path, or both — they name different
 * objects, so they add up. Each keeps the spelling the caller wrote, which is
 * how an entry names a source that has no destination of its own.
 *
 * A path that can't be parsed refuses the call. One that parses but names
 * nothing, or an id that isn't there, keeps its slot as a source nothing can be
 * copied from: each copy it was to make is that copy's own skip.
 * @param id - Source id(s), comma-separated for multiple
 * @param path - Source path(s), comma-separated for multiple
 * @param lookup - How the sources are found and vetted
 * @returns One entry per source, ids first, then the paths in order
 */
function sourceTargets(
  id: string | undefined,
  path: string | undefined,
  lookup: SourceLookup,
): SourceTarget[] {
  return namedTargets({ id, path }).map((named): SourceTarget => {
    if (named.param === "id") {
      return vetted(named, named.value, lookup);
    }

    // A path that doesn't parse is a mistake in the call; one that parses but
    // names nothing skips only its own copies.
    parseObjectPath(named.value, "path");

    const resolved = lookup.resolvePath(named.value);

    return resolved.id == null
      ? { id: named.value, named, skip: resolved.reason }
      : vetted(named, resolved.id, lookup);
  });
}

/**
 * A source, with the reason it can't be copied when it can't.
 * @param named - The source as the caller named it
 * @param id - Its id
 * @param lookup - What vets an id
 * @returns The source
 */
function vetted(
  named: NamedTarget,
  id: string,
  lookup: SourceLookup,
): SourceTarget {
  const skip = lookup.problem(id);

  return skip == null ? { id, named } : { id, named, skip };
}

/**
 * How a type's sources are found: its own path lookup, and its own id check.
 * @param type - Object type to duplicate
 * @param objectOf - Looks an object up
 * @returns The lookup
 */
function typeLookup(
  type: string,
  objectOf?: (id: string) => LiveAPI,
): SourceLookup {
  const find = objectOf ?? ((id: string): LiveAPI => LiveAPI.from(id));

  return {
    resolvePath: (entry) => resolvePathForType(type, entry),
    problem: (id) => {
      try {
        const object = vetObject(find(id), id, type);

        // A return track passes the type check, but Live can't copy it.
        if (type === "track") {
          regularTrackIndex(object);
        }

        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
  };
}

/**
 * Checks an object is there and is what a call asked to copy.
 * @param object - What the id names
 * @param id - The id, for the reason
 * @param type - Object type to duplicate
 * @returns The object
 * @throws Error saying why it can't be copied
 */
function vetObject(object: LiveAPI, id: string, type: string): LiveAPI {
  if (!object.exists()) {
    throw new Error(`id "${id}" does not exist`);
  }

  const mismatch = typeMismatch(object, type);

  if (mismatch != null) {
    throw new Error(mismatch);
  }

  return object;
}
