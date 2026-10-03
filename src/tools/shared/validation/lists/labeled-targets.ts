// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The preamble a create tool runs before it touches Live: check the call's
// lists and pair names and colors with what it makes. Write tools on the
// pipeline pair the same lists with `pairLabels`.

import { parseColors } from "#src/tools/shared/validation/color-parsing.ts";
import {
  type ListArg,
  validateListLengths,
} from "#src/tools/shared/validation/lists/list-lengths.ts";
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

interface NewTargetsArgs extends PairLabelsArgs {
  param: string;
  extraLists?: ListArg[];
}

/**
 * A create tool's preamble, once it has settled how many it makes.
 * @param args - The preamble parameters
 * @param args.noun - What the call makes, singular ("scene", "copy")
 * @param args.param - The param that said how many ("count", "path")
 * @param args.count - How many the call makes
 * @param args.name - The raw name param
 * @param args.color - The raw color param
 * @param args.extraLists - Further per-target lists, in the order to report them
 * @returns The call's name and color lists
 */
export function labelNewTargets({
  noun,
  param,
  count,
  name,
  color,
  extraLists = [],
}: NewTargetsArgs): PairedLabels {
  validateListLengths([
    { param, count, noun },
    { param: "name", value: name },
    { param: "color", value: color },
    ...extraLists,
  ]);

  return pairLabels({ noun, count, name, color });
}

/**
 * Pair the name and color lists with the items, where the count only settles
 * after the lists were checked.
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
