// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The preamble every create and update tool runs before it touches Live: check
// the call's lists, work out what it acts on, and pair names and colors with it.

import { parseColors } from "#src/tools/shared/validation/color-parsing.ts";
import {
  type ListArg,
  validateListLengths,
} from "#src/tools/shared/validation/lists/list-lengths.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  namedTargets,
  type NamedTarget,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type TargetParams,
  targetCount,
  targetParamLabel,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { parseNames } from "#src/tools/shared/validation/name-parsing.ts";
import {
  namedIdParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";

/** The name and color lists a call paired against what it acts on. */
export interface PairedLabels {
  parsedNames: ListEntries | null;
  parsedColors: ListEntries | null;
}

export interface LabeledTargets extends PairedLabels {
  /** The targets, in the order the call named them. */
  targets: NamedTarget[];
}

interface PairLabelsArgs {
  noun: string;
  count: number;
  name?: string;
  color?: string;
}

interface NewTargetsArgs extends PairLabelsArgs {
  param: string;
}

interface LabeledTargetsArgs {
  noun: string;
  targets: TargetParams;
  name?: string;
  color?: string;
  extraLists?: ListArg[];
}

/**
 * An update tool's preamble: refuse a call naming nothing, check its lists,
 * resolve the targets, and pair the name and color lists with them.
 * @param args - The preamble parameters
 * @param args.noun - What the call acts on, singular ("track")
 * @param args.targets - The call's id/ids and path/paths params
 * @param args.name - The raw name param
 * @param args.color - The raw color param
 * @param args.extraLists - Further per-target lists, in the order to report them
 * @returns The targets the call named, and its name and color lists
 */
export function resolveLabeledTargets({
  noun,
  targets,
  name,
  color,
  extraLists = [],
}: LabeledTargetsArgs): LabeledTargets {
  if (targetCount(targets) === 0) {
    throw new Error("id or path is required");
  }

  // Every list in the call is checked together, before any of them is split:
  // once one is split nothing knows whether the others are lists at all.
  validateListLengths([
    { param: targetParamLabel(targets), count: targetCount(targets) },
    { param: "name", value: name },
    { param: "color", value: color },
    ...extraLists,
  ]);

  const named = namedTargets(foldedTargets(targets));

  // Paired against the targets named, not the ones that resolve, so name[k] and
  // color[k] still land on target k when an earlier one is skipped.
  return {
    targets: named,
    ...pairLabels({ noun, count: named.length, name, color }),
  };
}

/**
 * The same preamble for a create tool, which settles how many it makes first.
 * @param args - The preamble parameters
 * @param args.noun - What the call makes, singular ("scene", "copy")
 * @param args.param - The param that said how many ("count", "path")
 * @param args.count - How many the call makes
 * @param args.name - The raw name param
 * @param args.color - The raw color param
 * @returns The call's name and color lists
 */
export function labelNewTargets({
  noun,
  param,
  count,
  name,
  color,
}: NewTargetsArgs): PairedLabels {
  validateListLengths([
    { param, count, noun },
    { param: "name", value: name },
    { param: "color", value: color },
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

// --- Helpers below main exports ---

/**
 * Both plural aliases folded onto `id` and `path`, so each target is read once
 * under the name the rest of the call uses.
 * @param targets - The call's id/ids and path/paths params
 * @returns The same targets, named by the canonical params
 */
function foldedTargets(targets: TargetParams): TargetParams {
  return {
    id: namedIdParam(targets.id, targets.ids, "ids"),
    path: namedPathParam(targets.path, targets.paths),
  };
}
