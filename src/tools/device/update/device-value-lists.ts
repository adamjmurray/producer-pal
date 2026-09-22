// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The booleans and numbers that pair one entry per target, the way name and
// color do. Each arrives as a string so a list can reach the handler at all.

import { type ListArg } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type ListEntries,
  splitList,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  booleanForIndex,
  numberForIndex,
} from "#src/tools/shared/validation/lists/typed-lists.ts";
import { type UpdatePropertyOptions } from "./helpers/update-device-properties.ts";

/** The per-target booleans and numbers, as one call sent them. */
export interface DeviceValueArgs {
  mute?: string;
  solo?: string;
  gainDb?: string;
  pan?: string;
  sendGainDb?: string;
  chokeGroup?: string;
  macroCount?: string;
  macroVariationIndex?: string;
}

/** One target's share of them, read back as the types Live is written with. */
export type DeviceValues = Pick<UpdatePropertyOptions, keyof DeviceValueArgs>;

/** Those params split against the targets, beside the call that sent them. */
export interface DeviceValueLists {
  args: DeviceValueArgs;
  entries: Record<keyof DeviceValueArgs, ListEntries | null>;
}

const BOOLEANS = ["mute", "solo"] as const;

const NUMBERS = [
  "gainDb",
  "pan",
  "sendGainDb",
  "chokeGroup",
  "macroCount",
  "macroVariationIndex",
] as const;

const PARAMS = [...BOOLEANS, ...NUMBERS];

/**
 * Every per-target boolean and number, for the whole-call length check.
 * @param args - The tool arguments as received
 * @returns One list arg per param, in the order to report them
 */
export function deviceValueListArgs(args: DeviceValueArgs): ListArg[] {
  return PARAMS.map((param) => ({ param, value: args[param] }));
}

/**
 * Split each per-target param against the targets the call named.
 *
 * Paired against the targets, not the objects that resolved, so entry k still
 * lands on target k when an earlier target found nothing.
 * @param args - The tool arguments as received
 * @param count - How many targets the call names
 * @returns The entries, beside the args that produced them
 * @throws Error when a list has an empty entry
 */
export function parseDeviceValueLists(
  args: DeviceValueArgs,
  count: number,
): DeviceValueLists {
  return {
    args,
    entries: Object.fromEntries(
      PARAMS.map((param) => [param, splitList(args[param], count, param)]),
    ) as DeviceValueLists["entries"],
  };
}

/**
 * The booleans and numbers one target gets.
 * @param lists - The split entries, from {@link parseDeviceValueLists}
 * @param index - The target's place in the call
 * @returns That target's values, each undefined where the call named none
 */
export function deviceValuesAt(
  lists: DeviceValueLists,
  index: number,
): DeviceValues {
  const { args, entries } = lists;
  const bool = (param: (typeof BOOLEANS)[number]): boolean | undefined =>
    booleanForIndex(args[param], index, entries[param]);
  const num = (param: (typeof NUMBERS)[number]): number | undefined =>
    numberForIndex(args[param], index, entries[param]);

  return {
    mute: bool("mute"),
    solo: bool("solo"),
    gainDb: num("gainDb"),
    pan: num("pan"),
    sendGainDb: num("sendGainDb"),
    chokeGroup: num("chokeGroup"),
    macroCount: num("macroCount"),
    macroVariationIndex: num("macroVariationIndex"),
  };
}
