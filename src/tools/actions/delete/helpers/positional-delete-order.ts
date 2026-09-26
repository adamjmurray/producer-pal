// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface PathSegment {
  collection: string;
  index: number;
}

/**
 * Orders devices for safe positional deletion. `delete_device N` removes by
 * index within a parent, so an earlier delete shifts every later sibling down.
 * Comparing the full `(collection, index)` segment lists gives one consistent
 * total order satisfying both safety rules:
 *
 * - **Siblings** (same parent) sort highest-index-first, so an earlier delete
 *   never shifts a later sibling onto the wrong index.
 * - **Descendants before ancestors**: when one path is a prefix of the other,
 *   the longer (nested) device deletes first, before the rack whose deletion
 *   would invalidate its path.
 *
 * Comparing segments — rather than the old parent-path *string length* — avoids
 * a non-transitive comparator: two devices in sibling chains of the same rack
 * have equal-length parent paths, which the length heuristic treated as
 * sort-equal, letting one interpose between two true siblings and flip their
 * delete order (deleting the lower index first, shifting the higher target).
 * @param a - First device
 * @param b - Second device
 * @returns Negative if a deletes first, positive if b deletes first
 */
export function compareDevicesForDeletion(a: LiveAPI, b: LiveAPI): number {
  const segsA = parsePathSegments(a.path);
  const segsB = parsePathSegments(b.path);
  const sharedDepth = Math.min(segsA.length, segsB.length);

  for (let i = 0; i < sharedDepth; i++) {
    const segA = segsA[i] as PathSegment;
    const segB = segsB[i] as PathSegment;

    if (segA.collection !== segB.collection) {
      // Different sub-collections of a shared parent (e.g. chains vs
      // return_chains) — independent deletes, so order is irrelevant to
      // correctness; a stable name comparison just keeps the sort consistent.
      return segA.collection < segB.collection ? -1 : 1;
    }

    if (segA.index !== segB.index) {
      return segB.index - segA.index; // Siblings: highest index first
    }
  }

  // One path is a prefix of the other: the longer one is nested inside the
  // shorter (its ancestor). Delete the descendant first.
  return segsB.length - segsA.length;
}

/**
 * Splits a Live API path into its ordered `(collection, index)` segments, e.g.
 * `live_set tracks 0 devices 1 chains 0 devices 2` →
 * `[(tracks,0), (devices,1), (chains,0), (devices,2)]`. The leading `live_set`
 * token has no index and is skipped.
 * @param path - The Live API path
 * @returns Ordered path segments
 */
function parsePathSegments(path: string): PathSegment[] {
  return [...path.matchAll(/(\w+) (\d+)/g)].map((match) => ({
    collection: match[1] as string,
    index: Number(match[2]),
  }));
}

/**
 * Tracks, scenes, and devices delete by position, so an earlier delete shifts
 * later siblings. Sorts highest-index-first, in place, so each delete targets
 * the right object.
 *
 * Clips and chains are deliberately left alone: they delete by id
 * (`delete_clip <id>`, and a chain by parking it on a free pad), so a sibling
 * shift never reaches them. Measured on 12.4.3 by
 * e2e/mcp/operations/ppal-delete-batch-ordering.test.ts, which deletes three
 * of four ascending — the worst case — and checks which one survived.
 * @param objectsToDelete - The resolved targets, mutated into deletion order
 * @param type - The tool-level type
 */
export function sortForPositionalDelete(
  objectsToDelete: Array<{ id: string; object: LiveAPI }>,
  type: string,
): void {
  if (type === "track" || type === "scene") {
    objectsToDelete.sort((a, b) => {
      // For tracks, handle both regular and return tracks
      const pathRegex =
        type === "track"
          ? /live_set (?:return_)?tracks (\d+)/
          : /live_set scenes (\d+)/;
      const indexA = Number(a.object.path.match(pathRegex)?.[1]);
      const indexB = Number(b.object.path.match(pathRegex)?.[1]);

      return indexB - indexA; // Descending order
    });
  } else if (type === "device") {
    objectsToDelete.sort((a, b) =>
      compareDevicesForDeletion(a.object, b.object),
    );
  }
}
