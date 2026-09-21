// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ListEntries,
  type PairLabels,
  splitList,
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
