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
 * WHAT THE SCOPE ASSUMES: the caller calls invalidateDevicePathCache() right
 * after anything that renumbers devices. That is a positioned insert, and also
 * an append Live re-sorts the chain around: it keeps a chain ordered by device
 * type, so an instrument or a MIDI effect pushes siblings down a slot even
 * though it was appended. Deleting anything inside the scope is not supported
 * at all — a held object follows its own target through an index shift, which
 * is exactly wrong for a path cache. See dev/LiveAPI-Object-Reuse.md.
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
    return fn();
  } finally {
    cache = outer;
  }
}

/**
 * Resolve a path, reusing the object if this call already resolved it.
 * Outside a scope this is plain LiveAPI.from.
 * @param path - Live API path
 * @returns The object at that path
 */
export function cachedDevicePath(path: string): LiveAPI {
  if (cache == null || path.startsWith("id ")) return LiveAPI.from(path);

  const hit = cache.get(path);

  if (hit != null) return hit;

  const object = LiveAPI.from(path);

  cache.set(path, object);

  return object;
}

/**
 * Drop every cached path. Call this after anything that shifts sibling indices.
 */
export function invalidateDevicePathCache(): void {
  cache?.clear();
}
