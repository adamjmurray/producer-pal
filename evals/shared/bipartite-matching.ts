// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Whether a perfect matching exists pairing every `left` item to a distinct
 * `right` item that satisfies `canPair`. Kuhn's augmenting-path algorithm.
 *
 * Used by the clip read-back check (`notesMatch`), where a greedy sort-then-pair
 * comparison can wrongly fail when expected notes carry OVERLAPPING any-of pitch
 * sets at the same start: index-pairing commits to one assignment and misses a
 * valid one. A matching search tries all reassignments. Inputs are tiny, so the
 * O(V·E) cost is irrelevant.
 *
 * When `left` and `right` are the same length (the caller's case), a full left
 * matching IS a perfect matching, so the returned boolean answers "do the sets
 * correspond one-to-one under `canPair`?".
 *
 * @param left - Left vertices
 * @param right - Right vertices
 * @param canPair - Whether a given left item may pair with a given right item
 * @returns True when every left item can be matched to a distinct right item
 */
export function hasPerfectMatching<L, R>(
  left: L[],
  right: R[],
  canPair: (l: L, r: R) => boolean,
): boolean {
  // matchedLeftOf[j] = index of the left item currently matched to right[j], or
  // -1 if right[j] is unmatched. Indices are in range by construction, so the
  // reads use `as` casts (repo bans non-null `!`) rather than guards.
  const matchedLeftOf = Array.from({ length: right.length }, () => -1);

  /**
   * Try to match left item `i` by finding an augmenting path: claim any pairable
   * right item that is either free or whose current owner can itself be rehomed.
   * @param i - Left index to place
   * @param seen - Right items already visited on this search (mutated)
   * @returns True when an augmenting path was found
   */
  const augment = (i: number, seen: boolean[]): boolean => {
    for (let j = 0; j < right.length; j++) {
      if (seen[j] || !canPair(left[i] as L, right[j] as R)) continue;

      seen[j] = true;

      if (
        matchedLeftOf[j] === -1 ||
        augment(matchedLeftOf[j] as number, seen)
      ) {
        matchedLeftOf[j] = i;

        return true;
      }
    }

    return false;
  };

  for (let i = 0; i < left.length; i++) {
    if (
      !augment(
        i,
        Array.from({ length: right.length }, () => false),
      )
    )
      return false;
  }

  return true;
}
