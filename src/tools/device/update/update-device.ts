// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";
import {
  type DrumPadGroup,
  chainsOnDrumPad,
  drumPadPath,
  resolveDrumPadGroup,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import {
  targetEntries,
  namedIdParam,
  namedPathParam,
  unwrapSingleResult,
  validateSendPair,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseColors,
} from "#src/tools/shared/validation/color-utils.ts";
import {
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import {
  moveDeviceToPath,
  moveDrumChainToPath,
  stripReturnChainLetter,
  // updateCollapsedState, // Kept for potential future use
} from "./helpers/update-device-helpers.ts";
import { validateParamEntries } from "./update-device-param-setters.ts";
import { type ParamValueResult } from "#src/tools/shared/device/helpers/device-display-helpers.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import {
  type UpdateTargetOptions,
  updateDeviceProperties,
  updateNonDeviceProperties,
} from "./helpers/update-device-property-helpers.ts";
import { updateDrumPadGroup } from "./helpers/update-device-drum-pad-helpers.ts";
import {
  isDeviceType,
  isValidUpdateType,
} from "./helpers/update-device-type-helpers.ts";
import { wrapDevicesInRack } from "./helpers/update-device-wrap-helpers.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import { targetCount } from "#src/tools/shared/validation/lists/target-lists.ts";

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

/** A bare pad path names the whole pad, so it resolves to a group of objects
 * rather than to one. Everything else resolves to a single object. */
type ResolvedTarget =
  | { kind: "object"; target: LiveAPI }
  | { kind: "drum-pad"; group: DrumPadGroup; padPath: string };

/**
 * Update device(s), chain(s), or drum pad(s) by ID or path
 * @param args - The parameters
 * @param args.id - Comma-separated ID(s)
 * @param args.ids - Hidden alias for id
 * @param args.path - Device/chain/drum-pad path
 * @param args.paths - Hidden alias for path
 * @param args.toPath - Move device to this path (devices only)
 * @param args.name - Display name (not drum pads)
 * @param args.params - {name, value} entries to set (devices only)
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
): Record<string, unknown> | Record<string, unknown>[] | null {
  // A value the schema coerced from a JSON null names nothing, so it must not
  // count as the caller having sent both addressing params.
  ids = namedIdParam(id, ids, "ids");
  path = namedPathParam(path, paths);

  if (ids == null && path == null) {
    throw new Error("updateDevice failed: id or path is required");
  }

  validateSendPair(sendGainDb, sendReturn, "updateDevice");
  validateParamEntries(params, "updateDevice");

  // One value for the whole call, so a per-target skip would repeat itself
  // down the list. Refused before any target is touched.
  if (mappedPitch != null && noteNameToMidi(mappedPitch) == null) {
    throw new Error(
      `updateDevice failed: invalid note name "${mappedPitch}" for mappedPitch`,
    );
  }

  let result: Record<string, unknown> | Record<string, unknown>[] | null;

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
      { param: "id and path", count: targetCount({ ids, path }) },
      { param: "name", value: name },
      { param: "color", value: color },
    ]);

    const items = targetItems(ids, path);
    const parsedNames = parseNames(name, items.length, "device");
    const parsedColors = parseColors(color, items.length, "device");

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
    const lastResult = Array.isArray(result) ? result.at(-1) : result;
    const lastId = lastResult?.id as string | undefined;

    if (lastId) {
      focusSelect({ id: lastId, detailView: "device" });
    }
  }

  return result;
}

/** One target the call named, and which param named it. */
export interface TargetItem {
  value: string;
  kind: "id" | "path";
}

/**
 * The targets a call names, ids first.
 *
 * `id` and `path` name different devices and add up, as everywhere else. Each
 * entry remembers which param it came from, because a device is reached
 * differently by id than by path — the other tools can resolve a path to an id
 * and forget the difference, and a device path can't be.
 * @param ids - The `id` param, comma-separated
 * @param path - The `path` param, comma-separated
 * @returns One entry per target
 */
export function targetItems(
  ids: string | undefined,
  path: string | undefined,
): TargetItem[] {
  return [
    ...(ids == null
      ? []
      : targetEntries(ids, "id").map((value): TargetItem => ({
          value,
          kind: "id",
        }))),
    ...(path == null
      ? []
      : targetEntries(path, "path").map((value): TargetItem => ({
          value,
          kind: "path",
        }))),
  ];
}

/**
 * Update every target the call named, resolving each by the param that named it
 * @param items - The targets, each tagged with the param it came from
 * @param updateOptions - Options to pass to updateTarget
 * @param parsedNames - Comma-separated names array, or null
 * @param parsedColors - Comma-separated colors array, or null
 * @returns Single result or array of results
 */
function updateMultipleTargets(
  items: TargetItem[],
  updateOptions: UpdateTargetOptions,
  parsedNames: ListEntries | null,
  parsedColors: ListEntries | null,
): Record<string, unknown> | Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  for (let i = 0; i < items.length; i++) {
    const { value, kind } = items[i] as TargetItem;
    const resolved =
      kind === "id" ? resolveIdToTarget(value) : resolvePathToTargetSafe(value);

    if (!resolved) {
      console.warn(`updateDevice: target not found at ${kind} "${value}"`);
      continue;
    }

    const options: UpdateTargetOptions = {
      ...updateOptions,
      name: getNameForIndex(updateOptions.name, i, parsedNames),
      color: getColorForIndex(updateOptions.color, i, parsedColors),
    };

    const result =
      resolved.kind === "drum-pad"
        ? updateDrumPadGroup(resolved.group, resolved.padPath, options)
        : updateTarget(resolved.target, options);

    if (result) {
      results.push(result as Record<string, unknown>);
    }
  }

  return unwrapSingleResult(results);
}

/**
 * Resolve an ID to a LiveAPI target
 * @param id - Object ID
 * @returns Resolved target or null if not found
 */
function resolveIdToTarget(id: string): ResolvedTarget | null {
  const target = LiveAPI.from(id);

  if (!target.exists()) return null;

  return drumPadTarget(target) ?? { kind: "object", target };
}

/**
 * A DrumPad id names the same thing its pad path does, so give it the same
 * whole-pad update. read-device hands these ids out, and without this most of
 * what it reports on a pad answers "not applicable to DrumPad" when written
 * back by id.
 * @param target - The object an id resolved to
 * @returns The whole-pad target, or null when this isn't a pad
 */
function drumPadTarget(target: LiveAPI): ResolvedTarget | null {
  if (target.type !== "DrumPad") return null;

  return {
    kind: "drum-pad",
    group: { pad: target, chains: chainsOnDrumPad(target) },
    padPath: drumPadPath(target),
  };
}

/**
 * Safely resolve a path to a Live API target, catching errors
 * @param path - Device/chain/drum-pad path
 * @returns Resolved target or null if not found or invalid
 */
function resolvePathToTargetSafe(path: string): ResolvedTarget | null {
  try {
    return resolvePathToTarget(path);
  } catch (e) {
    console.warn(`updateDevice: ${errorMessage(e)}`);

    return null;
  }
}

/**
 * Resolve a path to a Live API target (device, chain, or drum pad)
 * @param path - Device/chain/drum-pad path
 * @returns Resolved target or null if not found
 */
function resolvePathToTarget(path: string): ResolvedTarget | null {
  const resolved = resolvePathToLiveApi(path);

  switch (resolved.targetType) {
    case "device": // fallthrough
    case "chain": // fallthrough

    case "return-chain": {
      const target = resolveTargetFromPath(resolved.liveApiPath);

      return target ? { kind: "object", target } : null;
    }

    case "drum-pad": {
      // drumPadNote is guaranteed for drum-pad targetType
      const drumPadNote = resolved.drumPadNote as string;
      const { remainingSegments } = resolved;

      // A bare pad path (pC1) names the whole pad; anything further down
      // (pC1/c0, pC1/d0) names one object inside it.
      if (remainingSegments.length === 0) {
        const group = resolveDrumPadGroup(resolved.liveApiPath, drumPadNote);

        return group ? { kind: "drum-pad", group, padPath: path } : null;
      }

      const drumPadResult = resolveDrumPadFromPath(
        resolved.liveApiPath,
        drumPadNote,
        remainingSegments,
      );

      return drumPadResult.target
        ? { kind: "object", target: drumPadResult.target }
        : null;
    }

    // Unreachable: every TargetType is handled above, and the `never` keeps it
    // that way if a new one is added.
    /* v8 ignore start -- exhaustive switch: all TargetType values handled above */
    default: {
      const exhaustive: never = resolved.targetType;

      return exhaustive;
    }
    /* v8 ignore stop */
  }
}

/**
 * Resolve device or chain target from Live API path
 * @param liveApiPath - Live API canonical path
 * @returns LiveAPI object or null if not found
 */
function resolveTargetFromPath(liveApiPath: string): LiveAPI | null {
  const target = LiveAPI.from(liveApiPath);

  return target.exists() ? target : null;
}

/**
 * Update a single target (device, chain, or drum pad)
 * @param target - Live API object to update
 * @param options - Update options
 * @returns Result with ID and any params written, or null if update failed
 */
function updateTarget(
  target: LiveAPI,
  options: UpdateTargetOptions,
): { id: string; path?: string; params?: ParamValueResult[] } | null {
  const type = target.type;

  // Validate type is updatable
  if (!isValidUpdateType(type)) {
    console.warn(
      `updateDevice: cannot update ${type} objects (${targetLabel(target)})`,
    );

    return null;
  }

  // Handle move operation first (before other updates)
  if (options.toPath != null) {
    if (isProducerPalDevice(target)) {
      console.warn(
        "updateDevice: cannot move the Producer Pal device, skipping the move",
      );
    } else if (isDeviceType(type)) {
      const outcome = moveDeviceToPath(target, options.toPath);

      // "unresolvable" said why itself. Either way the move is skipped and the
      // rest of this update — and of the batch — carries on.
      if (outcome === "no-destination") {
        console.warn(`move target at path "${options.toPath}" does not exist`);
      } else if (outcome === "refused") {
        console.warn(
          `updateDevice: ${targetLabel(target)} was not moved to "${options.toPath}"`,
        );
      }
    } else if (type === "DrumChain") {
      moveDrumChainToPath(target, options.toPath, false);
    } else {
      console.warn(`updateDevice: cannot move ${type} ${targetLabel(target)}`);
    }
  }

  // No DrumPad case: a pad is never a lone target — id and path both resolve
  // one to the whole pad, and updateDrumPadGroup writes `name` to its chain,
  // since Live drops writes to `pad.name`.
  if (options.name != null) {
    target.set("name", stripReturnChainLetter(target, options.name));
  }

  if (!isDeviceType(type)) {
    updateNonDeviceProperties(target, type, options);

    return { id: target.id, ...pathField(target) };
  }

  const params = updateDeviceProperties(target, type, options);
  const result: { id: string; path?: string; params?: ParamValueResult[] } = {
    id: target.id,
    ...pathField(target),
  };

  if (params.length > 0) result.params = params;

  return result;
}
