// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Walks a running Live Set breadth-first and records what the LOM exposes.
//
// Every property `info` names is read, not just the ones the tools read today.
// A fixture that records only today's reads goes stale silently: the walk a
// tool does stops early against it, the object count comes out low, and the
// budget test goes green for the wrong reason.
//
// `info` is read per object, never cached by class or by path shape. Live
// answers differently object by object: a Drum Rack and an Instrument Rack are
// both "RackDevice" at the same path shape, and only the Drum Rack lists
// `drum_pads`. Reusing one listing across a shape cost a real 128-pad drum rack
// every one of its pads, and reported nothing wrong.
//
// Breadth-first because it batches: a level holds hundreds of objects, and one
// request carries a dozen of them.

import { liveApiBatch, type BatchContext, type Job } from "./live-api-batch.ts";
import {
  type DumpedObject,
  type LiveSetDump,
  type TypeInfo,
  type WalkOptions,
} from "./dump-types.ts";
import {
  childRefs,
  collapseTypeKeys,
  parseTypeInfo,
  redactFilePaths,
  type ListingEntry,
} from "./walk-live-set-helpers.ts";

// Every LOM object lists its parent as a child. The value is still recorded as
// a property; only the walk skips it. Following it would hang an alias path off
// every object in the Set, and nothing builds those paths.
const NEVER_TRAVERSED = new Set(["canonical_parent"]);

interface Found {
  asked: string;
  id: string;
  type: string;
  livePath: string;
  info: string;
}

interface Identified {
  /** The path Live reports. Objects are recorded under this. */
  path: string;
  id: string;
  type: string;
  /** Which distinct listing this object answered with. */
  typeKey: string;
  listing: TypeInfo;
}

interface WalkState {
  objects: Record<string, DumpedObject>;
  /** Distinct listings, named at the end. Many objects share one entry. */
  listings: Map<string, ListingEntry>;
  aliases: Record<string, string>;
  idToPath: Map<string, string>;
  queued: Set<string>;
  redacted: number;
}

/**
 * Walk a Live Set through ppal-live-api and record its structure.
 * @param ctx - Batch context pointed at the running device
 * @param options - Roots, limits, and what to leave out
 * @returns The dump, ready to write as JSON
 */
export async function walkLiveSet(
  ctx: BatchContext,
  options: WalkOptions,
): Promise<LiveSetDump> {
  const state: WalkState = {
    objects: {},
    listings: new Map(),
    aliases: {},
    idToPath: new Map(),
    queued: new Set(options.roots),
    redacted: 0,
  };

  let frontier = [...options.roots];
  let truncated = false;
  let level = 0;

  while (frontier.length > 0) {
    const room = options.maxObjects - Object.keys(state.objects).length;

    if (frontier.length > room) {
      frontier = frontier.slice(0, Math.max(room, 0));
      truncated = true;
    }

    if (frontier.length === 0) break;

    level++;

    const fresh = claimFresh(state, await identifyObjects(ctx, frontier));

    options.log(
      `  level ${String(level)}: ${String(frontier.length)} paths, ` +
        `${String(fresh.length)} new objects`,
    );

    frontier = await readObjects(ctx, state, options, fresh);
  }

  return buildDump(state, options, ctx, truncated);
}

/**
 * Assemble the finished dump and its summary.
 * @param state - Everything the walk collected
 * @param options - The options the walk ran with
 * @param ctx - Batch context, for its request counters
 * @param truncated - Whether --max-objects cut the walk short
 * @returns The dump
 */
function buildDump(
  state: WalkState,
  options: WalkOptions,
  ctx: BatchContext,
  truncated: boolean,
): LiveSetDump {
  const { types, finalKey } = collapseTypeKeys(state.listings);

  // Objects carried the per-shape cache key while the walk needed it. Keep it
  // only where the class name alone would not find the listing.
  for (const object of Object.values(state.objects)) {
    const key = finalKey.get(object.typeKey ?? "");

    if (key == null || key === object.type) {
      delete object.typeKey;
    } else {
      object.typeKey = key;
    }
  }

  return {
    meta: {
      generator: "scripts/live-api/dump-live-set",
      liveVersion: options.liveVersion,
      roots: options.roots,
      objects: Object.keys(state.objects).length,
      aliases: Object.keys(state.aliases).length,
      types: Object.keys(types).length,
      failedReads: ctx.stats.failedOps,
      redactedValues: state.redacted,
      requests: ctx.stats.requests,
      truncated,
      skippedChildren: [...NEVER_TRAVERSED, ...options.skipChildren],
    },
    types,
    objects: state.objects,
    aliases: state.aliases,
  };
}

/**
 * Ask Live what each path resolves to.
 * @param ctx - Batch context
 * @param paths - Paths to identify
 * @returns One entry per path, in order
 */
async function identifyObjects(
  ctx: BatchContext,
  paths: string[],
): Promise<Found[]> {
  const jobs: Job[] = paths.map((path) => ({
    path,
    ops: [
      { type: "get_property", property: "id" },
      { type: "get_property", property: "type" },
      { type: "get_property", property: "path" },
      { type: "info" },
    ],
  }));

  const results = await liveApiBatch(ctx, jobs);

  return paths.map((asked, index) => {
    const [id, type, livePath, info] = results[index] ?? [];

    return {
      asked,
      id: typeof id === "string" ? id : "0",
      type: typeof type === "string" ? type : "",
      livePath: typeof livePath === "string" ? livePath : "",
      info: typeof info === "string" ? info : "",
    };
  });
}

/**
 * Keep the paths that found an object nobody has recorded yet.
 *
 * Objects are recorded under the path Live reports, not the one that was asked
 * for. Live canonicalizes: it answers `live_set tracks 0 clip_slots 0` for a
 * slot reached through a scene, and `live_set tracks 1 arrangement_clips 0` for
 * one reached through `live_set view detail_clip`. Keying by what was asked
 * would file objects under whichever route the walk happened to try first.
 *
 * @param state - Walk state, updated with ids and aliases
 * @param found - What identifyObjects returned
 * @returns The entries worth reading properties for
 */
function claimFresh(state: WalkState, found: Found[]): Identified[] {
  const fresh: Identified[] = [];

  for (const entry of found) {
    // "0" is Live's answer for a path that resolves to nothing.
    if (entry.id === "0" || entry.type === "") continue;

    const path = entry.livePath === "" ? entry.asked : entry.livePath;
    const recorded = state.idToPath.get(entry.id);

    if (recorded != null) {
      // Both spellings can be queued before either is identified, and the one
      // Live prefers may be the second to arrive. It is not an alias of itself.
      if (entry.asked !== recorded) state.aliases[entry.asked] = recorded;

      continue;
    }

    state.idToPath.set(entry.id, path);
    state.queued.add(path);

    if (entry.asked !== path) state.aliases[entry.asked] = path;

    fresh.push({
      path,
      id: entry.id,
      type: entry.type,
      ...claimListing(state, entry, path),
    });
  }

  return fresh;
}

/**
 * Record this object's listing, sharing the entry when one already matches.
 * @param state - Walk state, updated with any newly seen listing
 * @param entry - What identifyObjects found
 * @param path - The path the object is recorded under
 * @returns The listing and the key it is stored under
 */
function claimListing(
  state: WalkState,
  entry: Found,
  path: string,
): { typeKey: string; listing: TypeInfo } {
  const listing = parseTypeInfo(entry.info);
  const typeKey = `${entry.type}\n${JSON.stringify(listing)}`;

  if (!state.listings.has(typeKey)) {
    state.listings.set(typeKey, {
      className: entry.type,
      examplePath: path,
      listing,
    });
  }

  return { typeKey, listing };
}

/**
 * Read every property and child list on each object, and queue what they name.
 * @param ctx - Batch context
 * @param state - Walk state, updated with the recorded objects
 * @param options - Redaction and the skip list
 * @param fresh - Objects claimed at this level
 * @returns The next level's paths
 */
async function readObjects(
  ctx: BatchContext,
  state: WalkState,
  options: WalkOptions,
  fresh: Identified[],
): Promise<string[]> {
  const plans = fresh.map((entry) => ({
    entry,
    names: [
      ...Object.keys(entry.listing.properties),
      ...Object.keys(entry.listing.children),
    ],
  }));

  const results = await liveApiBatch(
    ctx,
    plans.map(({ entry, names }) => ({
      path: entry.path,
      ops: names.map((property) => ({ type: "get" as const, property })),
    })),
  );

  const next: string[] = [];

  for (const [index, { entry, names }] of plans.entries()) {
    const values = results[index] ?? [];
    const properties: Record<string, unknown> = {};

    for (const [at, name] of names.entries()) {
      properties[name] = values[at] ?? null;
    }

    if (options.redactPaths) state.redacted += redactFilePaths(properties);

    state.objects[entry.path] = {
      id: entry.id,
      type: entry.type,
      typeKey: entry.typeKey,
      properties,
    };

    next.push(...queueChildren(state, options, entry, properties));
  }

  return next;
}

/**
 * Queue the children an object's own reads just named.
 * @param state - Walk state, updated with the queued paths
 * @param options - The skip list
 * @param entry - The object the children hang off
 * @param properties - That object's raw reads
 * @returns Paths to walk next
 */
function queueChildren(
  state: WalkState,
  options: WalkOptions,
  entry: Identified,
  properties: Record<string, unknown>,
): string[] {
  const children = entry.listing.children;
  const next: string[] = [];

  for (const [name, child] of Object.entries(children)) {
    if (NEVER_TRAVERSED.has(name) || options.skipChildren.has(name)) continue;

    for (const ref of childRefs(entry.path, name, child, properties[name])) {
      // A path that already resolved to a recorded object becomes an alias
      // rather than a second walk of the same subtree — see claimFresh. Tools
      // do build those paths (`live_set view selected_track`), so the fixture
      // has to answer them.
      if (state.queued.has(ref.path)) continue;

      state.queued.add(ref.path);
      next.push(ref.path);
    }
  }

  return next;
}
