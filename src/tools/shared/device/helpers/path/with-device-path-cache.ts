// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shares the container walk across the paths of one call.
 *
 * A batch of device paths climbs the same prefix over and over — sixteen
 * `t0/d0/c<n>` paths resolve track 0 and the rack sixteen times each — and each
 * repeat is another object off the pool. Inside the scope, a path resolves once
 * and the rest of the call reuses it.
 *
 * WHAT KEEPS IT HONEST: a cache hit is only used when the object still reports
 * the path it is filed under. A held object follows its own target, so anything
 * that renumbers devices rewrites the object's path and the key stops matching
 * — which is the same thing as "this path now names something else". Checking
 * that costs one property read and catches every move, including the ones no
 * caller thought to announce. Deletion is covered too: the path clears to "".
 *
 * invalidateDevicePathCache() is still called after a known renumber, so a
 * stale entry is dropped rather than re-resolved on next use. It is now an
 * optimization, not the thing correctness rests on.
 *
 * Ids are never cached: at mode 0 an id resolves to a path once and follows
 * that path afterward, so a second lookup of the same id is not the same
 * question. See the header of live-api-build.ts.
 */

let cache: Map<string, LiveAPI> | null = null;

/**
 * Run fn with device path resolutions shared across the call.
 * @param fn - The work to run inside the scope
 * @returns Whatever fn returns
 */
export function withDevicePathCache<T>(fn: () => T): T {
  const outer = cache;

  cache = new Map();

  try {
    const result = fn();

    // The cache is module state, torn down by the finally below. An async fn
    // returns at its first await, so the scope would close while the work is
    // still running and a request that overlaps this one would be handed these
    // objects. Nothing about that failure is visible, so say it out loud.
    if (isThenable(result)) {
      throw new Error(
        "withDevicePathCache needs a synchronous callback: the cache is torn " +
          "down before an awaited body would finish",
      );
    }

    return result;
  } finally {
    cache = outer;
  }
}

/**
 * Resolve a path, reusing the object if this call already resolved it. A path
 * that resolved to nothing is not cached. Outside a scope this is plain
 * LiveAPI.from.
 * @param path - Live API path
 * @returns The object at that path
 */
export function cachedDevicePath(path: string): LiveAPI {
  if (cache == null || path.startsWith("id ")) return LiveAPI.from(path);

  const hit = cache.get(path);

  // The object is never the stale half — it followed its target. The key is,
  // once something moved that object out from under this path. A mismatch
  // means re-resolve, and the entry is overwritten below.
  //
  // If a caller ever spells a path differently from the way Live gives it
  // back, this quietly stops hitting. The build-budget tests assert exact
  // resolve counts, so that shows up as a failure rather than as slow code.
  if (hit != null && hit.path === path) return hit;

  const object = LiveAPI.from(path);

  // An object built against a path that resolved to nothing never picks up an
  // occupant created there later — and creating a device at a path a failed
  // lookup just probed is an ordinary thing for one call to do. Caching the
  // miss would answer "doesn't exist" for a device that does, so only a hit is
  // worth keeping.
  if (object.exists()) cache.set(path, object);

  return object;
}

/**
 * Drop every cached path. Call this after anything that shifts sibling indices.
 */
export function invalidateDevicePathCache(): void {
  cache?.clear();
}

/**
 * Whether a value is a promise, so a scope can refuse an async callback.
 * @param value - Whatever the scope's callback returned
 * @returns True when awaiting it would defer work past the scope
 */
function isThenable(value: unknown): boolean {
  return (
    value != null && typeof (value as { then?: unknown }).then === "function"
  );
}
