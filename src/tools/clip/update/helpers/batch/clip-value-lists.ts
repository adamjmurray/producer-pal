// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The per-clip params: each one splits on commas and pairs 1:1 with the
// targets the call named, the way name and color do. The booleans arrive as
// coerced strings, so "true,false" survives the schema and is read out here.

import {
  type ListEntries,
  type PairLabels,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { parsePairedValues } from "#src/tools/shared/validation/lists/paired-values.ts";
import { booleanForIndex } from "#src/tools/shared/validation/lists/typed-lists.ts";

/** The per-clip string params, as one update-clip call sent them. */
export interface ClipValueArgs {
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
}

/** The per-clip booleans, still as the coerced strings the schema declares. */
export interface ClipFlagArgs {
  looping?: string;
  duplicateLoop?: string;
  warping?: string;
}

/** Every per-clip param one update-clip call sent. */
export interface ClipPerClipArgs extends ClipValueArgs, ClipFlagArgs {}

/** What one clip ends up with: the strings as sent, the booleans read out. */
export interface ClipValues extends ClipValueArgs {
  looping?: boolean;
  duplicateLoop?: boolean;
  warping?: boolean;
}

/** Each per-clip param, split against the targets the call named. */
export type ClipValueLists = Record<keyof ClipPerClipArgs, ListEntries | null>;

const LABELS: Record<keyof ClipPerClipArgs, PairLabels> = {
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
  looping: {
    param: "looping",
    noun: "value",
    item: "clip",
    shortfall: "kept the looping they had",
  },
  duplicateLoop: {
    param: "duplicateLoop",
    noun: "value",
    item: "clip",
    shortfall: "were not doubled",
  },
  warping: {
    param: "warping",
    noun: "value",
    item: "clip",
    shortfall: "kept the warping they had",
  },
};

const VALUE_PARAMS = [
  "timeSignature",
  "start",
  "length",
  "firstStart",
] as const;
const PARAMS = Object.keys(LABELS) as Array<keyof ClipPerClipArgs>;

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
  args: ClipPerClipArgs,
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
 * @returns The per-clip params for that target
 */
export function clipValuesAt(
  args: ClipPerClipArgs,
  lists: ClipValueLists,
  index: number,
): ClipValues {
  return {
    ...(Object.fromEntries(
      VALUE_PARAMS.map((param) => [
        param,
        valueForIndex(args[param], index, lists[param]),
      ]),
    ) as ClipValueArgs),
    looping: booleanForIndex(args.looping, index, lists.looping),
    duplicateLoop: booleanForIndex(
      args.duplicateLoop,
      index,
      lists.duplicateLoop,
    ),
    warping: booleanForIndex(args.warping, index, lists.warping),
  };
}
