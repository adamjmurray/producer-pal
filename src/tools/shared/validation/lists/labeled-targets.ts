// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Pairing a call's name and color lists with the targets they label.

import { parseColors } from "#src/tools/shared/validation/color-parsing.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { parseNames } from "#src/tools/shared/validation/name-parsing.ts";

/** The name and color lists a call paired against what it acts on. */
export interface PairedLabels {
  parsedNames: ListEntries | null;
  parsedColors: ListEntries | null;
}

interface PairLabelsArgs {
  noun: string;
  count: number;
  name?: string;
  color?: string;
}

/**
 * Pair the name and color lists with the items they label.
 * @param args - The pairing parameters
 * @param args.noun - What the call acts on, singular ("clip")
 * @param args.count - How many it acts on
 * @param args.name - The raw name param
 * @param args.color - The raw color param
 * @returns The call's name and color lists
 */
export function pairLabels({
  noun,
  count,
  name,
  color,
}: PairLabelsArgs): PairedLabels {
  return {
    parsedNames: parseNames(name, count, noun),
    parsedColors: parseColors(color, count, noun),
  };
}
