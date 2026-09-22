// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The booleans and numbers a track tool pairs per track: each one splits on
// commas and pairs 1:1 with the tracks the call names, the way name and color
// do. create-track sends only the three booleans; the rest are update-track's.

import { type ListArg } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type ListEntries,
  splitList,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  booleanForIndex,
  numberForIndex,
} from "#src/tools/shared/validation/lists/typed-lists.ts";

/** The per-track booleans and numbers, as one call sent them. */
export interface TrackValueArgs {
  mute?: string;
  solo?: string;
  arm?: string;
  gainDb?: string;
  pan?: string;
  leftPan?: string;
  rightPan?: string;
  sendGainDb?: string;
}

/** What one track takes from them. */
export interface TrackValues {
  mute?: boolean;
  solo?: boolean;
  arm?: boolean;
  gainDb?: number;
  pan?: number;
  leftPan?: number;
  rightPan?: number;
  sendGainDb?: number;
}

/** Each of those params, split against the tracks the call named. */
export type TrackValueLists = Record<keyof TrackValueArgs, ListEntries | null>;

const BOOLEANS = new Set(["mute", "solo", "arm"]);

const PARAMS: Array<keyof TrackValueArgs> = [
  "mute",
  "solo",
  "arm",
  "gainDb",
  "pan",
  "leftPan",
  "rightPan",
  "sendGainDb",
];

/**
 * The per-track params as list args, for the whole-call length check.
 * @param args - The tool arguments as received
 * @returns One entry per param, in the order to report them
 */
export function trackValueListArgs(args: TrackValueArgs): ListArg[] {
  return PARAMS.map((param) => ({ param, value: args[param] }));
}

/**
 * Split each per-track param against the tracks the call named.
 *
 * Paired against the targets, not the tracks that resolved, so entry k still
 * lands on target k when an earlier target found no track.
 * @param args - The tool arguments as received
 * @param count - How many tracks the call acts on
 * @returns Each param's entries, or null where one value covers every track
 * @throws Error when a list has an empty entry
 */
export function splitTrackValues(
  args: TrackValueArgs,
  count: number,
): TrackValueLists {
  return Object.fromEntries(
    PARAMS.map((param) => [param, splitList(args[param], count, param)]),
  ) as TrackValueLists;
}

/**
 * The values one track takes.
 * @param args - The tool arguments as received
 * @param lists - The split entries, from {@link splitTrackValues}
 * @param index - The track's place in the call
 * @returns That track's booleans and numbers
 */
export function trackValuesAt(
  args: TrackValueArgs,
  lists: TrackValueLists,
  index: number,
): TrackValues {
  return Object.fromEntries(
    PARAMS.map((param) => [
      param,
      BOOLEANS.has(param)
        ? booleanForIndex(args[param], index, lists[param])
        : numberForIndex(args[param], index, lists[param]),
    ]),
  );
}
