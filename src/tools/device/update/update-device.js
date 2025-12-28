import { noteNameToMidi } from "#src/shared/pitch.js";
import * as console from "#src/shared/v8-max-console.js";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/device-path-helpers.js";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.js";
import {
  setParamValues,
  updateABCompare,
  updateCollapsedState,
  updateMacroCount,
  updateMacroVariation,
} from "./update-device-helpers.js";

// ============================================================================
// Type detection helpers
// ============================================================================

function isValidUpdateType(type) {
  return (
    type.endsWith("Device") || type.endsWith("Chain") || type === "DrumPad"
  );
}

function isDeviceType(type) {
  return type.endsWith("Device");
}

function isRackDevice(type) {
  return type === "RackDevice";
}

function isChainType(type) {
  return type.endsWith("Chain");
}

function warnIfSet(paramName, value, type) {
  if (value != null) {
    console.error(`updateDevice: '${paramName}' not applicable to ${type}`);
  }
}

// ============================================================================
// Main export
// ============================================================================

/**
 * Update device(s), chain(s), or drum pad(s) by ID or path
 * @param {object} args - The parameters
 * @param {string} [args.ids] - Comma-separated ID(s)
 * @param {string} [args.path] - Device/chain/drum-pad path
 * @param {string} [args.name] - Display name (not drum pads)
 * @param {boolean} [args.collapsed] - Collapse/expand device view (devices only)
 * @param {string} [args.params] - JSON: {"paramId": value} (devices only)
 * @param {string} [args.macroVariation] - Rack variation action (racks only)
 * @param {number} [args.macroVariationIndex] - Rack variation index (racks only)
 * @param {number} [args.macroCount] - Rack visible macro count 0-16 (racks only)
 * @param {string} [args.abCompare] - A/B Compare action (devices only)
 * @param {boolean} [args.mute] - Mute state (chains/drum pads only)
 * @param {boolean} [args.solo] - Solo state (chains/drum pads only)
 * @param {string} [args.color] - Color #RRGGBB (chains only)
 * @param {number} [args.chokeGroup] - Choke group 0-16 (drum chains only)
 * @param {string} [args.mappedPitch] - Output MIDI note (drum chains only)
 * @returns {object|Array} Updated object info(s)
 */
export function updateDevice({
  ids,
  path,
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
}) {
  // Validate: exactly one of ids or path required
  if (!ids && !path) {
    throw new Error("Either ids or path must be provided");
  }

  if (ids && path) {
    throw new Error("Provide either ids or path, not both");
  }

  const updateOptions = {
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
 * @param {string[]} items - Array of paths or IDs
 * @param {Function} resolveItem - Function to resolve item to LiveAPI target
 * @param {string} itemType - "path" or "id" for error messages
 * @param {object} updateOptions - Options to pass to updateTarget
 * @returns {object|Array} Single result or array of results
 */
function updateMultipleTargets(items, resolveItem, itemType, updateOptions) {
  const results = [];

  for (const item of items) {
    const target = resolveItem(item);

    if (!target) {
      console.error(`updateDevice: target not found at ${itemType} "${item}"`);
      continue;
    }

    const result = updateTarget(target, updateOptions);

    if (result) {
      results.push(result);
    }
  }

  if (results.length === 0) {
    return [];
  }

  return results.length === 1 ? results[0] : results;
}

/**
 * Resolve an ID to a LiveAPI target
 * @param {string} id - Object ID
 * @returns {object|null} LiveAPI object or null if not found
 */
function resolveIdToTarget(id) {
  const target = LiveAPI.from(id);

  return target.exists() ? target : null;
}

// ============================================================================
// Path resolution
// ============================================================================

/**
 * Safely resolve a path to a Live API target, catching errors
 * @param {string} path - Device/chain/drum-pad path
 * @returns {object|null} LiveAPI object or null if not found or invalid
 */
function resolvePathToTargetSafe(path) {
  try {
    return resolvePathToTarget(path);
  } catch (e) {
    console.error(`updateDevice: ${e.message}`);

    return null;
  }
}

/**
 * Resolve a path to a Live API target (device, chain, or drum pad)
 * @param {string} path - Device/chain/drum-pad path
 * @returns {object|null} LiveAPI object or null if not found
 */
function resolvePathToTarget(path) {
  const resolved = resolvePathToLiveApi(path);

  if (resolved.targetType === "device") {
    return resolveDeviceTarget(resolved.liveApiPath);
  }

  if (
    resolved.targetType === "chain" ||
    resolved.targetType === "return-chain"
  ) {
    return resolveChainTarget(resolved.liveApiPath);
  }

  if (resolved.targetType === "drum-pad") {
    const drumPadResult = resolveDrumPadFromPath(
      resolved.liveApiPath,
      resolved.drumPadNote,
      resolved.remainingSegments,
    );

    return drumPadResult.target;
  }

  return null;
}

/**
 * Resolve a device from Live API path
 * @param {string} liveApiPath - Live API canonical path
 * @returns {object|null} LiveAPI object or null if not found
 */
function resolveDeviceTarget(liveApiPath) {
  const device = new LiveAPI(liveApiPath);

  return device.exists() ? device : null;
}

/**
 * Resolve a chain from Live API path
 * @param {string} liveApiPath - Live API canonical path
 * @returns {object|null} LiveAPI object or null if not found
 */
function resolveChainTarget(liveApiPath) {
  const chain = new LiveAPI(liveApiPath);

  return chain.exists() ? chain : null;
}

// ============================================================================
// Target update logic
// ============================================================================

function updateTarget(target, options) {
  const type = target.type;

  // Validate type is updatable
  if (!isValidUpdateType(type)) {
    throw new Error(`updateDevice: cannot update ${type} objects`);
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

function updateDeviceProperties(target, type, options) {
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
    setParamValues(params);
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

function updateNonDeviceProperties(target, type, options) {
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
