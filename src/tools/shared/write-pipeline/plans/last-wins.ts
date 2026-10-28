// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// One object named twice: the last mention wins, whatever it was spelled as.

import { type Target } from "../write-pipeline-types.ts";

/**
 * Find the items a later item overrides. Each item claims one or more keys,
 * and an item sharing a key with a later one loses to it. Items are compared
 * from the end, so the winner is always the last to claim.
 * @param claims - What each item claims, in the order named
 * @returns For each overridden item, the index of the item that overrides it
 */
export function lastWins(claims: string[][]): Map<number, number> {
  const overriddenBy = new Map<number, number>();
  const claimedBy = new Map<string, number>();

  for (const [index, keys] of [...claims.entries()].toReversed()) {
    const winner = keys
      .map((key) => claimedBy.get(key))
      .find((found) => found != null);

    // An overridden item claims nothing: it isn't written, so it can't block
    // an earlier one.
    if (winner != null) {
      overriddenBy.set(index, winner);
      continue;
    }

    for (const key of keys) {
      claimedBy.set(key, index);
    }
  }

  return overriddenBy;
}

/**
 * Find the targets a later target overrides. Targets with no key (skipped,
 * or creating something new) never override or lose. A target with several
 * keys loses to a later one sharing any of them.
 * @param targets - The call's targets, in the order named
 * @returns For each overridden target, the index of the one that overrides it
 */
export function lastWinsTargets<P>(
  targets: Array<Target<P>>,
): Map<number, number> {
  return lastWins(
    targets.map(({ key, keys }) => keys ?? (key == null ? [] : [key])),
  );
}
