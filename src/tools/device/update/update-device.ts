// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { select } from "#src/tools/session/select.ts";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { validateExclusiveParams } from "#src/tools/shared/validation/id-validation.ts";
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
import {
  type UpdatePropertyOptions,
  updateDeviceProperties,
  updateNonDeviceProperties,
} from "./helpers/update-device-property-helpers.ts";
import {
  isDeviceType,
  isValidUpdateType,
} from "./helpers/update-device-type-helpers.ts";
import { wrapDevicesInRack } from "./helpers/update-device-wrap-helpers.ts";

interface UpdateProperties extends UpdatePropertyOptions {
  toPath?: string;
  name?: string;
}

interface UpdateDeviceArgs extends UpdateProperties {
  ids?: string;
  path?: string;
  wrapInRack?: boolean;
  focus?: boolean;
}

interface UpdateOptions extends UpdateProperties {
  isDrumPadPath?: boolean;
}

interface ResolvedTarget {
  target: LiveAPI;
  isDrumPadPath?: boolean;
}

/**
 * Update device(s), chain(s), or drum pad(s) by ID or path
 * @param args - The parameters
 * @param args.ids - Comma-separated ID(s)
 * @param args.path - Device/chain/drum-pad path
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
 * @param args.sendReturn - Rack return chain name or letter, requires sendGainDb (chains only)
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
    ids,
    path,
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
  validateExclusiveParams(ids, path, "ids", "path");

  let result: Record<string, unknown> | Record<string, unknown>[] | null;

  if (wrapInRack) {
    result = wrapDevicesInRack({ ids, path, toPath, name }) as Record<
      string,
      unknown
    > | null;
  } else {
    const items = parseCommaSeparatedIds(path ?? ids);
    const parsedNames = parseNames(name, items.length, "updateDevice");
    const parsedColors = parseCommaSeparatedColors(color, items.length);

    const updateOptions: UpdateOptions = {
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
      select({ deviceId: lastId, detailView: "device" });
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
  updateOptions: UpdateOptions,
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

    // Merge resolution metadata (like isDrumPadPath) into options
    const optionsWithMetadata: UpdateOptions = {
      ...updateOptions,
      name: getNameForIndex(updateOptions.name, i, parsedNames),
      color: getColorForIndex(updateOptions.color, i, parsedColors),
      isDrumPadPath: resolved.isDrumPadPath,
    };

    const result = updateTarget(resolved.target, optionsWithMetadata);

    if (result) {
      results.push(result);
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

  return target.exists() ? { target } : null;
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

      return target ? { target } : null;
    }

    case "drum-pad": {
      // drumPadNote is guaranteed for drum-pad targetType
      const drumPadNote = resolved.drumPadNote as string;
      const { remainingSegments } = resolved;
      const drumPadResult = resolveDrumPadFromPath(
        resolved.liveApiPath,
        drumPadNote,
        remainingSegments,
      );

      if (!drumPadResult.target) {
        return null;
      }

      // Detect if this is a drum pad path (no explicit chain index) vs chain path
      // pC1 = pad path, pC1/c0 = chain path
      const hasExplicitChainIndex =
        remainingSegments.length > 0 &&
        (remainingSegments[0] as string).startsWith("c");

      return {
        target: drumPadResult.target,
        isDrumPadPath: !hasExplicitChainIndex,
      };
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
 * @returns Result with ID or null if update failed
 */
function updateTarget(
  target: LiveAPI,
  options: UpdateOptions,
): { id: string } | null {
  const type = target.type;

  // Validate type is updatable
  if (!isValidUpdateType(type)) {
    console.warn(`cannot update ${type} objects`);

    return null;
  }

  // Handle move operation first (before other updates)
  if (options.toPath != null) {
    if (isDeviceType(type)) {
      const outcome = moveDeviceToPath(target, options.toPath);

      if (outcome === "no-destination") {
        console.warn(`move target at path "${options.toPath}" does not exist`);
      } else if (outcome === "refused") {
        console.warn(`device not moved to "${options.toPath}"`);
      }
    } else if (type === "DrumChain") {
      moveDrumChainToPath(
        target,
        options.toPath,
        Boolean(options.isDrumPadPath),
      );
    } else {
      console.warn(`cannot move ${type}`);
    }
  }

  // Name works on devices and chains, but DrumPad names are read-only
  if (options.name != null) {
    if (type === "DrumPad") {
      console.warn("updateDevice: 'name' is read-only for DrumPad");
    } else {
      target.set("name", stripReturnChainLetter(target, options.name));
    }
  }

  if (isDeviceType(type)) {
    updateDeviceProperties(target, type, options);
  } else {
    updateNonDeviceProperties(target, type, options);
  }

  return { id: target.id };
}
