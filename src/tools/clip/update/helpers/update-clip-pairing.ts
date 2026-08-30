// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";

/** How a mismatched list is described in the warning. */
export interface PairLabels {
  /** The param the caller sent. */
  param: string;
  /** What one entry names, singular. */
  noun: string;
  /** What happens to the clips past the last entry. */
  shortfall: string;
}

/**
 * Lines a list up with the clips it applies to, warning when the counts
 * disagree — a caller that named the wrong number of entries gets told which
 * clips were left out rather than watching the rest land somewhere unintended.
 *
 * Nothing cycles: the extras go unused and the clips past the last entry get
 * nothing.
 * @param values - The list, in call order
 * @param clipCount - How many clips the call named, before any are dropped
 * @param labels - What to call the param and its entries in the warning
 * @returns Exactly clipCount entries, padded with null
 */
export function pairWithClips<T>(
  values: Array<T | null>,
  clipCount: number,
  labels: PairLabels,
): Array<T | null> {
  if (values.length !== clipCount) {
    const { param, noun, shortfall } = labels;

    console.warn(
      `${param} names ${values.length} ${noun}(s) for ${clipCount} clip(s); ` +
        (values.length > clipCount
          ? `the extra ${noun}s went unused`
          : `the clips past the last ${noun} ${shortfall}`),
    );
  }

  return Array.from({ length: clipCount }, (_unused, i) => values[i] ?? null);
}

/**
 * Pairs an arrangement position or length with the clips, broadcasting a lone
 * value to all of them.
 *
 * Only times broadcast. An arrangement position holds any number of clips, so
 * one time for the whole call is what a caller means by it. A destination
 * can't: a slot holds one clip, so broadcasting one would overwrite the rest.
 * @param values - The parsed values, in call order
 * @param clipCount - How many clips the call named
 * @param labels - What to call the param and its entries in the warning
 * @returns Exactly clipCount entries, padded with null
 */
export function pairArrangementValues<T>(
  values: Array<T | null>,
  clipCount: number,
  labels: PairLabels,
): Array<T | null> {
  const single = values.length === 1 ? (values[0] ?? null) : null;

  if (single != null) return Array.from({ length: clipCount }, () => single);

  return pairWithClips(values, clipCount, labels);
}
