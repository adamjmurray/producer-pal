// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The per-clip string params: each one splits on commas and pairs 1:1 with the
// targets the call named, the way name and color do.

import {
  type ListEntries,
  type PairLabels,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { parsePairedValues } from "#src/tools/shared/validation/lists/paired-values.ts";

/** The per-clip string params, as one update-clip call sent them. */
export interface ClipValueArgs {
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
}

/** Each of those params, split against the targets the call named. */
export type ClipValueLists = Record<keyof ClipValueArgs, ListEntries | null>;

const LABELS: Record<keyof ClipValueArgs, PairLabels> = {
  timeSignature: {
    param: "timeSignature",
    noun: "time signature",
    item: "clip",
    shortfall: "kept the meter they had",
  },
  start: {
    param: "start",
    noun: "position",
    item: "clip",
    shortfall: "kept the region they had",
  },
  length: {
    param: "length",
    noun: "length",
    item: "clip",
    shortfall: "kept the length they had",
  },
  firstStart: {
    param: "firstStart",
    noun: "position",
    item: "clip",
    shortfall: "kept the playback start they had",
  },
};

const PARAMS = Object.keys(LABELS) as Array<keyof ClipValueArgs>;

/**
 * Split each per-clip param against the targets the call named.
 *
 * Paired against the targets, not the clips that resolved, so entry k still
 * lands on target k when an earlier target found no clip.
 * @param args - The tool arguments as received
 * @param count - How many targets the call named
 * @returns Each param's entries, or null where one value covers every target
 * @throws Error when a list has an empty entry
 */
export function parseClipValueLists(
  args: ClipValueArgs,
  count: number,
): ClipValueLists {
  return Object.fromEntries(
    PARAMS.map((param) => [
      param,
      parsePairedValues(args[param], count, LABELS[param]),
    ]),
  ) as ClipValueLists;
}

/**
 * The per-clip params one target gets.
 * @param args - The tool arguments as received
 * @param lists - The split entries, from {@link parseClipValueLists}
 * @param index - The target's place in the call
 * @returns The four params for that target
 */
export function clipValuesAt(
  args: ClipValueArgs,
  lists: ClipValueLists,
  index: number,
): ClipValueArgs {
  return Object.fromEntries(
    PARAMS.map((param) => [
      param,
      valueForIndex(args[param], index, lists[param]),
    ]),
  );
}
