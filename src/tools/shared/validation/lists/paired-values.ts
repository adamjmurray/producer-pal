// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ListEntries,
  type PairLabels,
  splitList,
  valueForIndex,
  warnPairingMismatch,
} from "./list-pairing.ts";

/**
 * Split a comma-separated param into one entry per target, warning when it
 * names a different number than the call acts on.
 *
 * The same rule `name` uses, for any other string param that varies per target:
 * one value covers them all, a list pairs 1:1 in order. Read an entry back with
 * {@link valueForIndex}.
 * @param value - The raw param, as the caller sent it
 * @param count - How many targets the call acts on
 * @param labels - What to call the param and its entries in a warning
 * @returns One entry per target, or null when the value covers every target
 */
export function parsePairedValues(
  value: string | null | undefined,
  count: number,
  labels: PairLabels,
): ListEntries | null {
  const parsed = splitList(value ?? undefined, count, labels.param);

  warnPairingMismatch(parsed?.length ?? 0, count, labels);

  return parsed;
}

/** What to call each paired param in a mismatch warning. */
export type PairedParamLabels<K extends string> = Record<K, PairLabels>;

/**
 * Split several string params against the targets, and hand back a lookup for
 * one target's values.
 *
 * Paired against the targets named, not the ones that resolved, so entry k
 * still lands on target k when an earlier target was skipped.
 * @param args - The params, as the caller sent them
 * @param labels - Each param to pair, and what to call it in a warning
 * @param count - How many targets the call named
 * @returns The values for the target at an index
 * @throws Error when a list has an empty entry
 */
export function pairParams<K extends string>(
  args: Partial<Record<K, string>>,
  labels: PairedParamLabels<K>,
  count: number,
): (index: number) => Partial<Record<K, string>> {
  const params = Object.keys(labels) as K[];
  const lists = params.map((param) =>
    parsePairedValues(args[param], count, labels[param]),
  );

  return (index) =>
    Object.fromEntries(
      params.map((param, i) => [
        param,
        valueForIndex(args[param], index, lists[i] as ListEntries | null),
      ]),
    ) as Partial<Record<K, string>>;
}
