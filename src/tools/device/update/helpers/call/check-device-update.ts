// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type BrowserItem } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { namedParam } from "#src/tools/shared/helpers/param-presence.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  type ListArg,
  requireDestinationPerSource,
} from "#src/tools/shared/validation/lists/list-lengths.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  type PairedParamLabels,
  pairParams,
} from "#src/tools/shared/validation/lists/paired-values.ts";
import {
  type TargetParams,
  targetCount,
  targetParamLabel,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { type WrittenContainer } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type MaybePromise,
  type Target,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { lookUpPresets, presetDevice } from "./device-presets.ts";
import { type DeviceCall } from "./parse-device-call.ts";
import { type ResolvedTarget } from "./resolve-device-target.ts";
import { type UpdateTargetOptions } from "../update-device-properties.ts";
import { type wrapDevicesInRack } from "../wrap-devices-in-rack.ts";

/** What one target of an update-device call carries into its write. */
export type DevicePayload =
  | { resolved: ResolvedTarget }
  | { wrap: Parameters<typeof wrapDevicesInRack>[0] };

/** One entry per target, except where null means one value covers them all. */
export interface TargetLists {
  names: ListEntries | null;
  colors: ListEntries | null;
  /** Where each target moves, undefined where the call named nowhere */
  destinations: Array<string | undefined>;
  /** The other per-target strings for the target at an index */
  valuesAt: (
    index: number,
  ) => Pick<UpdateTargetOptions, "sendReturn" | "mappedPitch" | "preset">;
}

/** An update-device call, checked and ready to write. */
export interface DeviceChecked {
  options: UpdateTargetOptions;
  lists: TargetLists;
  /** Each target's preset, found in the browser; undefined where it gets none */
  presets: Array<BrowserItem | undefined>;
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
  /** How many targets the call named */
  named: number;
  focus?: boolean;
  /** The call's spelling of each written entry's container, where it is kept */
  written: Map<object, WrittenContainer | undefined>;
}

/** The other string params that pair per target, beside name and color. */
const DEVICE_VALUE_LABELS: PairedParamLabels<
  "sendReturn" | "mappedPitch" | "preset"
> = {
  sendReturn: {
    param: "sendReturn",
    noun: "return",
    item: "target",
    shortfall: "kept their sends",
  },
  mappedPitch: {
    param: "mappedPitch",
    noun: "pitch",
    item: "target",
    shortfall: "kept their pitch",
  },
  preset: {
    param: "preset",
    noun: "preset",
    item: "target",
    shortfall: "kept their devices",
  },
};

/**
 * The lists a call has to keep the same length. A wrap takes one rack from
 * every device it names, so nothing pairs.
 * @param call - The update-device call
 * @returns The lists to compare, none for a wrap
 */
export function deviceListArgs(call: DeviceCall): ListArg[] {
  const { name, color, sendReturn, mappedPitch, preset } = call.options;

  return call.wrapInRack === true
    ? []
    : [
        {
          param: targetParamLabel(call),
          count: targetCount(call),
        },
        { param: "name", value: name },
        { param: "color", value: color },
        { param: "sendReturn", value: sendReturn },
        { param: "mappedPitch", value: mappedPitch },
        { param: "preset", value: preset },
      ];
}

/**
 * Check what the call pairs up and look up its presets, refusing a bad call
 * before anything is written or loaded. Every preset name is looked up first,
 * so one that matches no preset, or several, fails the call with nothing
 * changed.
 * @param call - The update-device call
 * @param targets - The call's targets
 * @param deadline - The request deadline
 * @returns The call, checked; a promise when it names presets to look up
 */
export function checkDeviceUpdate(
  call: DeviceCall,
  targets: Array<Target<DevicePayload>>,
  deadline: number | null | undefined,
): MaybePromise<DeviceChecked> {
  const { name, color, sendReturn, mappedPitch, preset } = call.options;
  const { sent, focus, options } = call;
  const named = targetCount(call);
  const written = new Map<object, WrittenContainer | undefined>();

  if (call.wrapInRack === true) {
    // A wrap takes one rack from every device it names: nothing pairs.
    const lists: TargetLists = {
      names: null,
      colors: null,
      destinations: [],
      valuesAt: pairParams({}, DEVICE_VALUE_LABELS, 0),
    };

    return { options, lists, presets: [], sent, named, focus, written };
  }

  const { parsedNames, parsedColors } = pairLabels({
    noun: "device",
    count: targets.length,
    name,
    color,
  });
  const lists: TargetLists = {
    names: parsedNames,
    colors: parsedColors,
    destinations: moveDestinations(call.toPath, targets.length),
    valuesAt: pairParams(
      { sendReturn, mappedPitch, preset },
      DEVICE_VALUE_LABELS,
      targets.length,
    ),
  };
  const checked: Omit<DeviceChecked, "presets"> = {
    options,
    lists,
    sent,
    named,
    focus,
    written,
  };

  return preset == null
    ? { ...checked, presets: [] }
    : presetsFor(targets, lists, deadline).then((presets) => ({
        ...checked,
        presets,
      }));
}

// --- Helpers below main exports ---

/**
 * Look up the preset each target is to load.
 * @param targets - The call's targets
 * @param lists - The call's per-target values
 * @param deadline - The request deadline
 * @returns Each target's browser item, undefined where it gets none
 */
async function presetsFor(
  targets: Array<Target<DevicePayload>>,
  lists: TargetLists,
  deadline: number | null | undefined,
): Promise<Array<BrowserItem | undefined>> {
  const devices = targets.map((target) =>
    target.data != null && "resolved" in target.data
      ? presetDevice(target.data.resolved)
      : null,
  );
  const presets = targets.map((_target, i) => lists.valuesAt(i).preset);

  return await lookUpPresets(devices, presets, deadline);
}

/**
 * One destination per target, refused before anything moves when they don't
 * pair. A destination never covers several targets: a device slot holds one
 * object. Repeats are fine — move_device inserts rather than overwrites.
 * @param toPath - The destination(s), comma-separated
 * @param count - How many targets the call names
 * @returns One destination per target, undefined where the call named none
 */
function moveDestinations(
  toPath: string | undefined,
  count: number,
): Array<string | undefined> {
  const named = namedParam(toPath, "toPath");

  if (named == null) {
    return Array.from({ length: count }, () => undefined);
  }

  const entries = targetEntries(named, "toPath");

  requireDestinationPerSource(
    { param: "toPath", count: entries.length },
    { param: "the call", count, noun: "target" },
  );

  return entries;
}
