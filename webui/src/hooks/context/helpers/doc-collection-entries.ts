// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** A setTimeout handle held in a ref. */
export type TimerRef = { current: ReturnType<typeof setTimeout> | null };

/** Minimum shape a collection entry view must expose (the stable handle). */
export interface DocCollectionEntry {
  /** Slug (filename without extension); the stable handle for save/delete. */
  name: string;
}

/** Status of a whole doc collection. */
export type DocCollectionStatus<TView> =
  | { kind: "loading" }
  | { kind: "ready"; entries: TView[] }
  | { kind: "error"; message: string };

/**
 * Clear a setTimeout ref if armed, and null it out.
 * @param ref - The timer ref to clear
 */
export function clearTimer(ref: TimerRef): void {
  if (ref.current != null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

/**
 * Replace the matching entry in a ready status with the server's echo, or
 * append it when it is new. A non-ready status is returned unchanged.
 * @param prev - The previous collection status
 * @param updated - The server's echo of one entry
 * @returns The status with that entry merged in
 */
export function mergeEntry<TView extends DocCollectionEntry>(
  prev: DocCollectionStatus<TView>,
  updated: TView,
): DocCollectionStatus<TView> {
  if (prev.kind !== "ready") {
    return prev;
  }

  const exists = prev.entries.some((entry) => entry.name === updated.name);
  const entries = exists
    ? prev.entries.map((entry) =>
        entry.name === updated.name ? updated : entry,
      )
    : [...prev.entries, updated];

  return { kind: "ready", entries };
}

/**
 * Remove the named entry from a ready status.
 * @param prev - The previous collection status
 * @param name - The entry to remove
 * @returns The status without that entry
 */
export function removeEntry<TView extends DocCollectionEntry>(
  prev: DocCollectionStatus<TView>,
  name: string,
): DocCollectionStatus<TView> {
  if (prev.kind !== "ready") {
    return prev;
  }

  return {
    kind: "ready",
    entries: prev.entries.filter((entry) => entry.name !== name),
  };
}
