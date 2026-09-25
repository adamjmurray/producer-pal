// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import {
  namedIdParam,
  namedParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import { validateSendPair } from "#src/tools/shared/helpers/send-validation.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  type NamedTarget,
  namedTargets,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { type WriteResult } from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { validateParamEntries } from "./helpers/params/param-entry-validation.ts";
import { macroVariationParamsReason } from "./helpers/rack-macro-updates.ts";
import { type UpdateTargetOptions } from "./helpers/update-device-properties.ts";
import {
  type PresetOutcome,
  type TargetLists,
  updateMultipleTargets,
} from "./helpers/update-multiple-targets.ts";
import { wrapDevicesInRack } from "./helpers/wrap-devices-in-rack.ts";
import {
  requireDestinationPerSource,
  validateListLengths,
} from "#src/tools/shared/validation/lists/list-lengths.ts";
import { everyEntry } from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  type PairedParamLabels,
  pairParams,
} from "#src/tools/shared/validation/lists/paired-values.ts";
import {
  targetCount,
  targetParamLabel,
} from "#src/tools/shared/validation/lists/target-lists.ts";

export interface UpdateDeviceArgs extends UpdateTargetOptions {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  wrapInRack?: boolean;
  focus?: boolean;
}

/** Args a wrap can take: `force` only unlocks a params write, refused anyway. */
const WRAP_ALLOWED_ARGS = new Set(["name", "force"]);

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

/** A device update, checked and ready to run: a wrap, or per-target updates. */
export type DeviceUpdatePlan = { focus?: boolean } & (
  | { wrap: Parameters<typeof wrapDevicesInRack>[0] }
  | {
      /** The targets, tagged with the param that named each */
      items: NamedTarget[];
      updateOptions: UpdateTargetOptions;
      lists: TargetLists;
    }
);

/**
 * Update device(s), chain(s), or drum pad(s) by ID or path. A `preset` is
 * loaded by updateDeviceWithPreset before this runs.
 * @param args - The update-device args
 * @param _context - Internal context object (unused)
 * @returns Updated object info(s)
 */
export function updateDevice(
  args: UpdateDeviceArgs,
  _context: Partial<ToolContext> = {},
): WriteResult<Record<string, unknown>> {
  return runDeviceUpdate(planDeviceUpdate(args));
}

/**
 * Check a device update, refusing a bad call before anything is written.
 * @param args - The parameters
 * @param args.id - Comma-separated ID(s)
 * @param args.ids - Hidden alias for id
 * @param args.path - Device/chain/drum-pad path
 * @param args.paths - Hidden alias for path
 * @param args.toPath - Where to move, one destination per target (devices only)
 * @param args.name - Display name (not drum pads)
 * @param args.params - {name, value} entries to set (devices, plus `sample` on
 *   a drum pad or one of its layers)
 * @param args.actions - Device-specific action strings (devices only)
 * @param args.macroVariation - Rack variation action (racks only)
 * @param args.macroVariationIndex - Rack variation index (racks only)
 * @param args.macroCount - Rack visible macro count 0-16 (racks only)
 * @param args.abCompare - A/B Compare action (devices only)
 * @param args.mute - Mute state (chains/drum pads only)
 * @param args.solo - Solo state (chains/drum pads only)
 * @param args.color - Color #RRGGBB (chains only)
 * @param args.gainDb - Chain gain in dB (chains only)
 * @param args.pan - Chain pan -1 to 1 (chains only)
 * @param args.sendGainDb - Chain send level in dB, requires sendReturn (chains only)
 * @param args.sendReturn - Rack return chain id, name, or letter, requires sendGainDb (chains only)
 * @param args.sends - Several sends at once as [{return, gainDb}] (chains only)
 * @param args.chokeGroup - Choke group 0-16 (drum chains only)
 * @param args.mappedPitch - Output MIDI note (drum chains only)
 * @param args.wrapInRack - Wrap device(s) in a new rack
 * @param args.force - Allow a destructive pad-device swap a `sample` write needs
 * @param args.preset - Preset to load first (updateDeviceWithPreset loads it)
 * @param args.focus - Select the device and show device detail view
 * @returns The checked update
 */
export function planDeviceUpdate({
  id,
  ids,
  path,
  paths,
  toPath,
  name,
  params,
  actions,
  macroVariation,
  macroVariationIndex,
  macroCount,
  abCompare,
  mute,
  solo,
  color,
  gainDb,
  pan,
  sendGainDb,
  sendReturn,
  sends,
  chokeGroup,
  mappedPitch,
  wrapInRack,
  force,
  preset,
  focus,
}: UpdateDeviceArgs): DeviceUpdatePlan {
  // A value the schema coerced from a JSON null names nothing, so it must not
  // count as the caller having sent both addressing params.
  ids = namedIdParam(id, ids, "ids");
  path = namedPathParam(path, paths);

  if (ids == null && path == null) {
    throw new Error("id or path is required");
  }

  // No toPath here: each target takes the destination at its own position.
  const updateOptions: UpdateTargetOptions = {
    name,
    params,
    actions,
    macroVariation,
    macroVariationIndex,
    macroCount,
    abCompare,
    mute,
    solo,
    color,
    gainDb,
    pan,
    sendGainDb,
    sendReturn,
    sends,
    chokeGroup,
    mappedPitch,
    force,
    preset,
  };

  // First, so a wrap names every arg it would ignore before any of them is
  // checked on its own.
  refuseArgsWrapIgnores(wrapInRack, updateOptions);

  validateSendPair(sendGainDb, sendReturn);
  updateOptions.params = validateParamEntries(params);

  // Checked for the whole call, so a per-target skip wouldn't repeat itself
  // down the list. Refused before any target is touched (ADR-0035).
  for (const pitch of everyEntry(
    mappedPitch,
    targetCount({ ids, path }),
    "mappedPitch",
  )) {
    if (noteNameToMidi(pitch) == null) {
      throw new Error(`invalid note name "${pitch}" for mappedPitch`);
    }
  }

  const badVariation = macroVariationParamsReason(
    macroVariation,
    macroVariationIndex,
  );

  if (badVariation != null) {
    throw new Error(badVariation);
  }

  if (wrapInRack) {
    return { wrap: { ids, path, toPath, name }, focus };
  }

  // Every list in the call is checked together, before any of them is split:
  // once one is split nothing knows whether the others are lists at all.
  // toPath is left out — moveDestinations owns it, so a lone destination
  // against several targets is refused rather than broadcast.
  validateListLengths([
    {
      param: targetParamLabel({ ids, path }),
      count: targetCount({ ids, path }),
    },
    { param: "name", value: name },
    { param: "color", value: color },
    { param: "sendReturn", value: sendReturn },
    { param: "mappedPitch", value: mappedPitch },
    { param: "preset", value: preset },
  ]);

  const items = namedTargets({ id: ids, path });
  const { parsedNames, parsedColors } = pairLabels({
    noun: "device",
    count: items.length,
    name,
    color,
  });
  const destinations = moveDestinations(toPath, items.length);

  return {
    items,
    updateOptions,
    lists: {
      names: parsedNames,
      colors: parsedColors,
      destinations,
      valuesAt: pairParams(
        { sendReturn, mappedPitch, preset },
        DEVICE_VALUE_LABELS,
        items.length,
      ),
    },
    focus,
  };
}

/**
 * Run a checked device update.
 * @param plan - What planDeviceUpdate checked
 * @param presetOutcomes - What loading each target's preset did, by index
 * @returns Updated object info(s)
 */
export function runDeviceUpdate(
  plan: DeviceUpdatePlan,
  presetOutcomes: Array<PresetOutcome | undefined> = [],
): WriteResult<Record<string, unknown>> {
  const result =
    "wrap" in plan
      ? { ...wrapDevicesInRack(plan.wrap) }
      : updateMultipleTargets(
          plan.items,
          plan.updateOptions,
          plan.lists,
          presetOutcomes,
        );

  if (plan.focus) {
    const lastId = lastWrittenId(result);

    if (lastId) {
      focusSelect({ id: lastId, detailView: "device" });
    }
  }

  return result;
}

/**
 * Refuse update args sent with wrapInRack. A wrap uses only the targets,
 * toPath and name, so the rest would be dropped while the call reads as done.
 * @param wrapInRack - Whether the call wraps; nothing is refused otherwise
 * @param options - The update args
 */
function refuseArgsWrapIgnores(
  wrapInRack: boolean | undefined,
  options: UpdateTargetOptions,
): void {
  if (!wrapInRack) {
    return;
  }

  const ignored = Object.entries(options)
    .filter(([key, value]) => !WRAP_ALLOWED_ARGS.has(key) && isSent(value))
    .map(([key]) => key);

  if (ignored.length > 0) {
    throw new Error(
      `wrapInRack cannot be used with ${ignored.join(", ")}: wrap first, then update in another call`,
    );
  }
}

/**
 * Whether an arg asks for anything: an empty list sets nothing.
 * @param value - The arg's value
 * @returns True when it was sent with something in it
 */
function isSent(value: unknown): boolean {
  return value != null && !(Array.isArray(value) && value.length === 0);
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

/**
 * The id of the last target the call actually wrote, for focus — never a
 * skipped one, whose id names something the call couldn't reach.
 * @param result - What the call is about to return
 * @returns That id, or undefined when nothing was written
 */
function lastWrittenId(
  result: WriteResult<Record<string, unknown>>,
): string | undefined {
  const entries = Array.isArray(result) ? result : [result];
  const written = entries.filter((entry) => entry.ok !== false);

  return written.at(-1)?.id as string | undefined;
}
