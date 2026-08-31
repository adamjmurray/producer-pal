// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
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
  namedIdParam,
  namedPathParam,
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { validateExclusiveParams } from "#src/tools/shared/validation/id-validation.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
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

  validateExclusiveParams(ids, path, "id", "path");

  let result: Record<string, unknown> | Record<string, unknown>[] | null;

  if (wrapInRack) {
    result = wrapDevicesInRack({ ids, path, toPath, name }) as Record<
      string,
      unknown
    > | null;
  } else {
    const items = parseCommaSeparatedIds(path ?? ids);
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
      chokeGroup,
      mappedPitch,
      force,
    };

    result = updateMultipleTargets(
      items,
      path ? resolvePathToTargetSafe : resolveIdToTarget,
      path ? "path" : "id",
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

/**
 * Update multiple targets with common logic for path/ID resolution
 * @param items - Array of paths or IDs
 * @param resolveItem - Function to resolve item to ResolvedTarget
 * @param itemType - "path" or "id" for error messages
 * @param updateOptions - Options to pass to updateTarget
 * @param parsedNames - Comma-separated names array, or null
 * @param parsedColors - Comma-separated colors array, or null
 * @returns Single result or array of results
 */
function updateMultipleTargets(
  items: string[],
  resolveItem: (item: string) => ResolvedTarget | null,
  itemType: string,
  updateOptions: UpdateTargetOptions,
  parsedNames: string[] | null,
  parsedColors: string[] | null,
): Record<string, unknown> | Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as string;
    const resolved = resolveItem(item);

    if (!resolved) {
      console.warn(`updateDevice: target not found at ${itemType} "${item}"`);
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
    console.warn(`cannot update ${type} objects`);

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
        console.warn(`device not moved to "${options.toPath}"`);
      }
    } else if (type === "DrumChain") {
      moveDrumChainToPath(target, options.toPath, false);
    } else {
      console.warn(`cannot move ${type}`);
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
