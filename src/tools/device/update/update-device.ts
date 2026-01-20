import { errorMessage } from "#src/shared/error-utils.js";
import { noteNameToMidi } from "#src/shared/pitch.js";
import * as console from "#src/shared/v8-max-console.js";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.js";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.js";
import { validateExclusiveParams } from "#src/tools/shared/validation/id-validation.js";
import {
  moveDeviceToPath,
  moveDrumChainToPath,
  setParamValues,
  updateABCompare,
  updateCollapsedState,
  updateMacroCount,
  updateMacroVariation,
} from "./update-device-helpers.js";
import { wrapDevicesInRack } from "./update-device-wrap-helpers.js";

// ============================================================================
// Type detection helpers
// ============================================================================

/**
 * Check if type is updatable (device, chain, or drum pad)
 * @param type - Live object type
 * @returns True if type is updatable
 */
function isValidUpdateType(type: string): boolean {
  return (
    type.endsWith("Device") || type.endsWith("Chain") || type === "DrumPad"
  );
}

/**
 * Check if type is a device type
 * @param type - Live object type
 * @returns True if type ends with Device
 */
function isDeviceType(type: string): boolean {
  return type.endsWith("Device");
}

/**
 * Check if type is a rack device
 * @param type - Live object type
 * @returns True if type is RackDevice
 */
function isRackDevice(type: string): boolean {
  return type === "RackDevice";
}

/**
 * Check if type is a chain type
 * @param type - Live object type
 * @returns True if type ends with Chain
 */
function isChainType(type: string): boolean {
  return type.endsWith("Chain");
}

/**
 * Warn if parameter is set but not applicable to this type
 * @param paramName - Parameter name
 * @param value - Parameter value
 * @param type - Live object type
 */
function warnIfSet(paramName: string, value: unknown, type: string): void {
  if (value != null) {
    console.error(`updateDevice: '${paramName}' not applicable to ${type}`);
  }
}

// ============================================================================
// Main export
// ============================================================================

interface UpdateDeviceArgs {
  ids?: string;
  path?: string;
  toPath?: string;
  name?: string;
  collapsed?: boolean;
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
  wrapInRack?: boolean;
}

interface UpdateOptions {
  toPath?: string;
  name?: string;
  collapsed?: boolean;
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
 * @param args.collapsed - Collapse/expand device view (devices only)
 * @param args.params - JSON: {"paramId": value} (devices only)
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
    collapsed,
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

  // Handle wrapInRack separately (creates rack and moves devices into it)
  if (wrapInRack) {
    return wrapDevicesInRack({ ids, path, toPath, name }) as Record<
      string,
      unknown
    > | null;
  }

  const updateOptions: UpdateOptions = {
    toPath,
    name,
    collapsed,
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

  // Use path-based or ID-based resolution
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

// ============================================================================
// Target resolution helpers
// ============================================================================

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
      console.error(`updateDevice: target not found at ${itemType} "${item}"`);
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

// ============================================================================
// Path resolution
// ============================================================================

/**
 * Safely resolve a path to a Live API target, catching errors
 * @param path - Device/chain/drum-pad path
 * @returns Resolved target or null if not found or invalid
 */
function resolvePathToTargetSafe(path: string): ResolvedTarget | null {
  try {
    return resolvePathToTarget(path);
  } catch (e) {
    console.error(`updateDevice: ${errorMessage(e)}`);

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
    case "device": {
      const target = resolveDeviceTarget(resolved.liveApiPath);

      return target ? { target } : null;
    }

    case "chain":

    // fallthrough
    case "return-chain": {
      const target = resolveChainTarget(resolved.liveApiPath);

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
 * Resolve a device from Live API path
 * @param liveApiPath - Live API canonical path
 * @returns LiveAPI object or null if not found
 */
function resolveDeviceTarget(liveApiPath: string): LiveAPI | null {
  const device = LiveAPI.from(liveApiPath);

  return device.exists() ? device : null;
}

/**
 * Resolve a chain from Live API path
 * @param liveApiPath - Live API canonical path
 * @returns LiveAPI object or null if not found
 */
function resolveChainTarget(liveApiPath: string): LiveAPI | null {
  const chain = LiveAPI.from(liveApiPath);

  return chain.exists() ? chain : null;
}

// ============================================================================
// Target update logic
// ============================================================================

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
    console.error(`Warning: cannot update ${type} objects`);

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
      console.error(`Warning: cannot move ${type}`);
    }
  }

  // Name works on devices and chains, but DrumPad names are read-only
  if (options.name != null) {
    if (type === "DrumPad") {
      console.error("updateDevice: 'name' is read-only for DrumPad");
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
    collapsed,
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

  // All *Device types support these
  if (collapsed != null) {
    updateCollapsedState(target, collapsed);
  }

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
    collapsed,
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
  warnIfSet("collapsed", collapsed, type);
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
        console.error(`updateDevice: invalid note name "${mappedPitch}"`);
      }
    }
  } else {
    warnIfSet("chokeGroup", chokeGroup, type);
    warnIfSet("mappedPitch", mappedPitch, type);
  }
}
