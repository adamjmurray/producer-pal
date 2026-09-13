// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import {
  namedIdParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import { validateSendPair } from "#src/tools/shared/helpers/send-validation.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { namedTargets } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type WriteResult } from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { validateParamEntries } from "./helpers/params/param-entry-validation.ts";
import { type UpdateTargetOptions } from "./helpers/update-device-properties.ts";
import { updateMultipleTargets } from "./helpers/update-multiple-targets.ts";
import { wrapDevicesInRack } from "./helpers/wrap-devices-in-rack.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  targetCount,
  targetParamLabel,
} from "#src/tools/shared/validation/lists/target-lists.ts";

interface UpdateDeviceArgs extends UpdateTargetOptions {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  wrapInRack?: boolean;
  focus?: boolean;
}

/**
 * Update device(s), chain(s), or drum pad(s) by ID or path
 * @param args - The parameters
 * @param args.id - Comma-separated ID(s)
 * @param args.ids - Hidden alias for id
 * @param args.path - Device/chain/drum-pad path
 * @param args.paths - Hidden alias for path
 * @param args.toPath - Move device to this path (devices only)
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
 * @param args.focus - Select the device and show device detail view
 * @param _context - Internal context object (unused)
 * @returns Updated object info(s)
 */
export function updateDevice(
  {
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
    focus,
  }: UpdateDeviceArgs,
  _context: Partial<ToolContext> = {},
): WriteResult<Record<string, unknown>> | null {
  // A value the schema coerced from a JSON null names nothing, so it must not
  // count as the caller having sent both addressing params.
  ids = namedIdParam(id, ids, "ids");
  path = namedPathParam(path, paths);

  if (ids == null && path == null) {
    throw new Error("id or path is required");
  }

  validateSendPair(sendGainDb, sendReturn);
  validateParamEntries(params);

  // One value for the whole call, so a per-target skip would repeat itself
  // down the list. Refused before any target is touched.
  if (mappedPitch != null && noteNameToMidi(mappedPitch) == null) {
    throw new Error(`invalid note name "${mappedPitch}" for mappedPitch`);
  }

  let result: WriteResult<Record<string, unknown>> | null;

  if (wrapInRack) {
    result = wrapDevicesInRack({ ids, path, toPath, name }) as Record<
      string,
      unknown
    > | null;
  } else {
    // Every list in the call is checked together, before any of them is split:
    // once one is split nothing knows whether the others are lists at all.
    // toPath is left out — it is one destination for the whole call, not a
    // per-device list.
    validateListLengths([
      {
        param: targetParamLabel({ ids, path }),
        count: targetCount({ ids, path }),
      },
      { param: "name", value: name },
      { param: "color", value: color },
    ]);

    const items = namedTargets({ id: ids, path });
    const { parsedNames, parsedColors } = pairLabels({
      noun: "device",
      count: items.length,
      name,
      color,
    });

    const updateOptions: UpdateTargetOptions = {
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
      force,
    };

    result = updateMultipleTargets(
      items,
      updateOptions,
      parsedNames,
      parsedColors,
    );
  }

  if (focus && result != null) {
    const lastId = lastWrittenId(result);

    if (lastId) {
      focusSelect({ id: lastId, detailView: "device" });
    }
  }

  return result;
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
