// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import { validateExclusiveParams } from "#src/tools/shared/validation/id-validation.ts";
import {
  moveDeviceToPath,
  moveDrumChainToPath,
  setParamValues,
  updateABCompare,
  // updateCollapsedState, // Kept for potential future use
  updateMacroCount,
  updateMacroVariation,
} from "./update-device-helpers.ts";
import {
  isChainType,
  isDeviceType,
  isRackDevice,
  isValidUpdateType,
  warnIfSet,
} from "./update-device-type-helpers.ts";
import { wrapDevicesInRack } from "./update-device-wrap-helpers.ts";

interface UpdateProperties {
  toPath?: string;
  name?: string;
  // collapsed?: boolean; // Kept for potential future use
  params?: string;
  macroVariation?: string;
  macroVariationIndex?: number;
  macroCount?: number;
  abCompare?: string;
  mute?: boolean;
  solo?: boolean;
  color?: string;
  chokeGroup?: number;
  mappedPitch?: string;
}

interface UpdateDeviceArgs extends UpdateProperties {
  ids?: string;
  path?: string;
  wrapInRack?: boolean;
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
 * @param args.params - JSON: {"paramName": value} (devices only)
 * @param args.macroVariation - Rack variation action (racks only)
 * @param args.macroVariationIndex - Rack variation index (racks only)
 * @param args.macroCount - Rack visible macro count 0-16 (racks only)
 * @param args.abCompare - A/B Compare action (devices only)
 * @param args.mute - Mute state (chains/drum pads only)
 * @param args.solo - Solo state (chains/drum pads only)
 * @param args.color - Color #RRGGBB (chains only)
 * @param args.chokeGroup - Choke group 0-16 (drum chains only)
 * @param args.mappedPitch - Output MIDI note (drum chains only)
 * @param args.wrapInRack - Wrap device(s) in a new rack
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
    macroVariation,
    macroVariationIndex,
    macroCount,
    abCompare,
    mute,
    solo,
    color,
    chokeGroup,
    mappedPitch,
    wrapInRack,
  }: UpdateDeviceArgs,
  _context: Partial<ToolContext> = {},
): Record<string, unknown> | Record<string, unknown>[] | null {
  validateExclusiveParams(ids, path, "ids", "path");

  if (wrapInRack) {
    return wrapDevicesInRack({ ids, path, toPath, name }) as Record<
      string,
      unknown
    > | null;
  }

  const updateOptions: UpdateOptions = {
    toPath,
    name,
    params,
    macroVariation,
    macroVariationIndex,
    macroCount,
    abCompare,
    mute,
    solo,
    color,
    chokeGroup,
    mappedPitch,
  };

  if (path) {
    return updateMultipleTargets(
      parseCommaSeparatedIds(path),
      resolvePathToTargetSafe,
      "path",
      updateOptions,
    );
  }

  return updateMultipleTargets(
    parseCommaSeparatedIds(ids),
    resolveIdToTarget,
    "id",
    updateOptions,
  );
}

/**
 * Update multiple targets with common logic for path/ID resolution
 * @param items - Array of paths or IDs
 * @param resolveItem - Function to resolve item to ResolvedTarget
 * @param itemType - "path" or "id" for error messages
 * @param updateOptions - Options to pass to updateTarget
 * @returns Single result or array of results
 */
function updateMultipleTargets(
  items: string[],
  resolveItem: (item: string) => ResolvedTarget | null,
  itemType: string,
  updateOptions: UpdateOptions,
): Record<string, unknown> | Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  for (const item of items) {
    const resolved = resolveItem(item);

    if (!resolved) {
      console.warn(`updateDevice: target not found at ${itemType} "${item}"`);
      continue;
    }

    // Merge resolution metadata (like isDrumPadPath) into options
    const optionsWithMetadata: UpdateOptions = {
      ...updateOptions,
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
      moveDeviceToPath(target, options.toPath);
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
      target.set("name", options.name);
    }
  }

  if (isDeviceType(type)) {
    updateDeviceProperties(target, type, options);
  } else {
    updateNonDeviceProperties(target, type, options);
  }

  return { id: target.id };
}

/**
 * Update device-specific properties
 * @param target - Device to update
 * @param type - Device type
 * @param options - Update options
 */
function updateDeviceProperties(
  target: LiveAPI,
  type: string,
  options: UpdateOptions,
): void {
  const {
    params,
    macroVariation,
    macroVariationIndex,
    macroCount,
    abCompare,
    mute,
    solo,
    color,
    chokeGroup,
    mappedPitch,
  } = options;

  // collapsed — kept for potential future use
  // if (options.collapsed != null) {
  //   updateCollapsedState(target, options.collapsed);
  // }

  if (params != null) {
    setParamValues(target, params);
  }

  if (abCompare != null) {
    updateABCompare(target, abCompare);
  }

  // Rack-only properties
  if (isRackDevice(type)) {
    if (macroVariation != null || macroVariationIndex != null) {
      updateMacroVariation(target, macroVariation, macroVariationIndex);
    }

    if (macroCount != null) {
      updateMacroCount(target, macroCount);
    }
  } else {
    warnIfSet("macroVariation", macroVariation, type);
    warnIfSet("macroVariationIndex", macroVariationIndex, type);
    warnIfSet("macroCount", macroCount, type);
  }

  // Warn for non-device properties on devices
  warnIfSet("mute", mute, type);
  warnIfSet("solo", solo, type);
  warnIfSet("color", color, type);
  warnIfSet("chokeGroup", chokeGroup, type);
  warnIfSet("mappedPitch", mappedPitch, type);
}

/**
 * Update chain/drum pad properties
 * @param target - Chain or drum pad to update
 * @param type - Target type
 * @param options - Update options
 */
function updateNonDeviceProperties(
  target: LiveAPI,
  type: string,
  options: UpdateOptions,
): void {
  const {
    params,
    macroVariation,
    macroVariationIndex,
    macroCount,
    abCompare,
    mute,
    solo,
    color,
    chokeGroup,
    mappedPitch,
  } = options;

  // Warn for device-only properties
  warnIfSet("params", params, type);
  warnIfSet("macroVariation", macroVariation, type);
  warnIfSet("macroVariationIndex", macroVariationIndex, type);
  warnIfSet("macroCount", macroCount, type);
  warnIfSet("abCompare", abCompare, type);

  // Mute/solo work on Chain, DrumChain, DrumPad
  if (mute != null) {
    target.set("mute", mute ? 1 : 0);
  }

  if (solo != null) {
    target.set("solo", solo ? 1 : 0);
  }

  // Color works on Chain and DrumChain (not DrumPad)
  if (isChainType(type)) {
    if (color != null) {
      target.setColor(color);
    }
  } else {
    warnIfSet("color", color, type);
  }

  // DrumChain only: chokeGroup, mappedPitch
  if (type === "DrumChain") {
    if (chokeGroup != null) {
      target.set("choke_group", chokeGroup);
    }

    if (mappedPitch != null) {
      const midiNote = noteNameToMidi(mappedPitch);

      if (midiNote != null) {
        target.set("out_note", midiNote);
      } else {
        console.warn(`updateDevice: invalid note name "${mappedPitch}"`);
      }
    }
  } else {
    warnIfSet("chokeGroup", chokeGroup, type);
    warnIfSet("mappedPitch", mappedPitch, type);
  }
}
