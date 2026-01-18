import { noteNameToMidi, isValidNoteName } from "#src/shared/pitch.js";
import * as console from "#src/shared/v8-max-console.js";
import {
  isDivisionLabel,
  isPanLabel,
} from "#src/tools/shared/device/helpers/device-display-helpers.js";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/device-path-helpers.js";

// ============================================================================
// Device move helpers
// ============================================================================

/**
 * Parse drum pad note from a path
 * @param {string} path - Path that may contain a drum pad segment
 * @returns {string|null} Note name (e.g., "C1", "F#2") or null if not a drum pad path
 */
function parseDrumPadNoteFromPath(path) {
  const match = path.match(/\/p([A-G][#b]?\d+|\*)(?:\/|$)/);

  return match ? match[1] : null;
}

/**
 * Move a device to a new location
 * @param {LiveAPI} device - LiveAPI device object
 * @param {string} toPath - Target path
 */
export function moveDeviceToPath(device, toPath) {
  const { container, position } = resolveInsertionPath(toPath);

  if (!container || !container.exists()) {
    console.error(`Warning: move target at path "${toPath}" does not exist`);

    return;
  }

  const liveSet = LiveAPI.from("live_set");
  const deviceId = device.id.startsWith("id ") ? device.id : `id ${device.id}`;
  const containerId = container.id.startsWith("id ")
    ? container.id
    : `id ${container.id}`;

  liveSet.call("move_device", deviceId, containerId, position ?? 0);
}

/**
 * Move a drum chain to a different pad by updating in_note
 * @param {LiveAPI} chain - LiveAPI drum chain object
 * @param {string} toPath - Target drum pad path
 * @param {boolean} moveEntirePad - If true, move all chains with same in_note
 */
export function moveDrumChainToPath(chain, toPath, moveEntirePad) {
  const targetNote = parseDrumPadNoteFromPath(toPath);

  if (targetNote == null) {
    console.error(`Warning: toPath "${toPath}" is not a drum pad path`);

    return;
  }

  const targetInNote = targetNote === "*" ? -1 : noteNameToMidi(targetNote);

  if (targetInNote == null) {
    console.error(`Warning: invalid note "${targetNote}" in toPath`);

    return;
  }

  if (moveEntirePad) {
    const sourceInNote = chain.getProperty("in_note");
    const drumRackPath = chain.path.replace(/ chains \d+$/, "");
    const drumRack = LiveAPI.from(drumRackPath);
    const allChains = drumRack.getChildren("chains");

    for (const c of allChains) {
      if (c.getProperty("in_note") === sourceInNote) {
        c.set("in_note", targetInNote);
      }
    }
  } else {
    chain.set("in_note", targetInNote);
  }
}

// ============================================================================
// Collapsed state
// ============================================================================

/**
 * Update the collapsed state of a device view
 * @param {LiveAPI} device - Live API device object
 * @param {boolean} collapsed - Whether to collapse the device view
 */
export function updateCollapsedState(device, collapsed) {
  const deviceView = LiveAPI.from(`${device.path} view`);

  if (deviceView.exists()) {
    deviceView.set("is_collapsed", collapsed ? 1 : 0);
  }
}

// ============================================================================
// Parameter values
// ============================================================================

/**
 * Set parameter values from JSON string
 * @param {LiveAPI} device - LiveAPI device object to update
 * @param {string} paramsJson - JSON object mapping param IDs to values
 */
export function setParamValues(device, paramsJson) {
  const paramValues = JSON.parse(paramsJson);

  for (const [paramId, inputValue] of Object.entries(paramValues)) {
    const param = resolveParamForDevice(device, paramId);

    if (!param || !param.exists()) {
      console.error(`updateDevice: param "${paramId}" not found on device`);
      continue;
    }

    setParamValue(param, inputValue);
  }
}

/**
 * Resolve a param ID relative to a target device
 * @param {LiveAPI} device - LiveAPI device object
 * @param {string} paramId - Param identifier (path ending in "parameters N", or absolute ID)
 * @returns {LiveAPI|null} LiveAPI param object or null
 */
function resolveParamForDevice(device, paramId) {
  // If paramId ends with "parameters N", extract index and resolve relative to device
  // This enables multi-path param updates where the same param index is applied to each device
  const match = paramId.match(/parameters (\d+)$/);

  if (match) {
    return LiveAPI.from(`${device.path} parameters ${match[1]}`);
  }

  // Default: use absolute ID resolution (backward compatible for single-device updates)
  return LiveAPI.from(paramId);
}

/**
 * Set a parameter value with type-appropriate handling
 * @param {LiveAPI} param - Parameter to set
 * @param {string | number} inputValue - Value to set
 */
function setParamValue(param, inputValue) {
  const isQuantized =
    /** @type {number} */ (param.getProperty("is_quantized")) > 0;

  // 1. Enum - string input with quantized param
  if (isQuantized && typeof inputValue === "string") {
    const valueItems = /** @type {string[]} */ (param.get("value_items"));
    const index = valueItems.indexOf(inputValue);

    if (index === -1) {
      console.error(
        `updateDevice: "${inputValue}" is not valid. Options: ${valueItems.join(", ")}`,
      );

      return;
    }

    param.set("value", index);

    return;
  }

  // 2. Note - string matching note pattern (e.g., "C4", "F#-1")
  if (typeof inputValue === "string" && isValidNoteName(inputValue)) {
    const midi = noteNameToMidi(inputValue);

    if (midi == null) {
      console.error(`updateDevice: invalid note name "${inputValue}"`);

      return;
    }

    param.set("value", midi);

    return;
  }

  // 3. Pan - detect via current label, convert -1/1 to internal range
  const currentValue = param.getProperty("value");
  const currentLabel = /** @type {string} */ (
    param.call("str_for_value", currentValue)
  );

  if (isPanLabel(currentLabel)) {
    const min = /** @type {number} */ (param.getProperty("min"));
    const max = /** @type {number} */ (param.getProperty("max"));
    // Convert -1 to 1 → internal range
    const numValue = /** @type {number} */ (inputValue);
    const internalValue = ((numValue + 1) / 2) * (max - min) + min;

    param.set("value", internalValue);

    return;
  }

  // 4. Division params - string input matching fraction format (e.g., "1/8")
  const minLabel = /** @type {string} */ (
    param.call("str_for_value", param.getProperty("min"))
  );

  if (isDivisionLabel(currentLabel) || isDivisionLabel(minLabel)) {
    const rawValue = findDivisionRawValue(param, inputValue);

    if (rawValue != null) {
      param.set("value", rawValue);
    } else {
      console.error(
        `updateDevice: "${inputValue}" is not a valid division option`,
      );
    }

    return;
  }

  // 5. All other numeric - set display_value directly
  param.set("display_value", inputValue);
}

/**
 * Find the raw value for a division parameter by matching input to str_for_value
 * @param {LiveAPI} param - LiveAPI parameter object
 * @param {string|number} inputValue - Target value (e.g., "1/8" or "1")
 * @returns {number|null} Raw value or null if not found
 */
function findDivisionRawValue(param, inputValue) {
  const min = /** @type {number} */ (param.getProperty("min"));
  const max = /** @type {number} */ (param.getProperty("max"));
  const minInt = Math.ceil(Math.min(min, max));
  const maxInt = Math.floor(Math.max(min, max));
  const targetLabel =
    typeof inputValue === "number" ? String(inputValue) : inputValue;

  for (let i = minInt; i <= maxInt; i++) {
    const label = param.call("str_for_value", i);
    const labelStr = typeof label === "number" ? String(label) : label;

    if (labelStr === targetLabel) {
      return i;
    }
  }

  return null;
}

// ============================================================================
// Macro variations
// ============================================================================

/**
 * Update macro variation state for rack devices
 * @param {LiveAPI} device - Live API device object
 * @param {string} [action] - Variation action: create, load, delete, revert, randomize
 * @param {number} [index] - Variation index for load/delete (0-based)
 */
export function updateMacroVariation(device, action, index) {
  const canHaveChains = device.getProperty("can_have_chains");

  if (!canHaveChains) {
    console.error(
      "updateDevice: macro variations only available on rack devices",
    );

    return;
  }

  if (!validateMacroVariationParams(action, index)) {
    return;
  }

  warnIfIndexIgnored(action, index);

  if (!setVariationIndex(device, action, index)) {
    return;
  }

  executeMacroVariationAction(device, action);
}

/**
 * Validate macro variation parameter combinations
 * @param {string | undefined} action - Variation action
 * @param {number | undefined} index - Variation index
 * @returns {boolean} True if parameters are valid
 */
function validateMacroVariationParams(action, index) {
  if (index != null && action == null) {
    console.error(
      "updateDevice: macroVariationIndex requires macroVariation 'load' or 'delete'",
    );

    return false;
  }

  if ((action === "load" || action === "delete") && index == null) {
    console.error(
      `updateDevice: macroVariation '${action}' requires macroVariationIndex`,
    );

    return false;
  }

  return true;
}

/**
 * Warn if index parameter is ignored for this action
 * @param {string | undefined} action - Variation action
 * @param {number | undefined} index - Variation index
 */
function warnIfIndexIgnored(action, index) {
  if (index == null) {
    return;
  }

  if (action === "create") {
    console.error(
      "updateDevice: macroVariationIndex ignored for 'create' (variations always appended)",
    );
  } else if (action === "revert") {
    console.error("updateDevice: macroVariationIndex ignored for 'revert'");
  } else if (action === "randomize") {
    console.error("updateDevice: macroVariationIndex ignored for 'randomize'");
  }
}

/**
 * Set the selected variation index on device
 * @param {LiveAPI} device - Rack device
 * @param {string | undefined} action - Variation action
 * @param {number | undefined} index - Variation index to select
 * @returns {boolean} True if successful
 */
function setVariationIndex(device, action, index) {
  if ((action !== "load" && action !== "delete") || index == null) {
    return true;
  }

  const variationCount = /** @type {number} */ (
    device.getProperty("variation_count")
  );

  if (index >= variationCount) {
    console.error(
      `updateDevice: variation index ${index} out of range (${variationCount} available)`,
    );

    return false;
  }

  device.set("selected_variation_index", index);

  return true;
}

/**
 * Execute the macro variation action on device
 * @param {LiveAPI} device - Rack device
 * @param {string | undefined} action - Action to execute
 */
function executeMacroVariationAction(device, action) {
  switch (action) {
    case "create":
      device.call("store_variation");
      break;
    case "load":
      device.call("recall_selected_variation");
      break;
    case "revert":
      device.call("recall_last_used_variation");
      break;
    case "delete":
      device.call("delete_selected_variation");
      break;
    case "randomize":
      device.call("randomize_macros");
      break;
  }
}

// ============================================================================
// Macro count
// ============================================================================

/**
 * Update visible macro count for rack devices.
 * Macros are added/removed in pairs, so odd counts are rounded up to the next even.
 * @param {LiveAPI} device - Live API device object
 * @param {number} targetCount - Target number of visible macros (0-16)
 */
export function updateMacroCount(device, targetCount) {
  const canHaveChains = device.getProperty("can_have_chains");

  if (!canHaveChains) {
    console.error("updateDevice: macro count only available on rack devices");

    return;
  }

  // Macros are added/removed in pairs - round up odd numbers to next even
  let effectiveTarget = targetCount;

  if (targetCount % 2 !== 0) {
    effectiveTarget = Math.min(targetCount + 1, 16);
    console.error(
      `updateDevice: macro count rounded from ${targetCount} to ${effectiveTarget} (macros come in pairs)`,
    );
  }

  const currentCount = /** @type {number} */ (
    device.getProperty("visible_macro_count")
  );
  const diff = effectiveTarget - currentCount;
  const pairCount = Math.abs(diff) / 2;

  if (diff > 0) {
    for (let i = 0; i < pairCount; i++) {
      device.call("add_macro");
    }
  } else if (diff < 0) {
    for (let i = 0; i < pairCount; i++) {
      device.call("remove_macro");
    }
  }
}

// ============================================================================
// A/B Compare
// ============================================================================

/**
 * Update A/B Compare state for devices that support it
 * @param {LiveAPI} device - Live API device object
 * @param {string} action - "a", "b", or "save"
 */
export function updateABCompare(device, action) {
  const canCompareAB = device.getProperty("can_compare_ab");

  if (!canCompareAB) {
    console.error("updateDevice: A/B Compare not available on this device");

    return;
  }

  switch (action) {
    case "a":
      device.set("is_using_compare_preset_b", 0);
      break;
    case "b":
      device.set("is_using_compare_preset_b", 1);
      break;
    case "save":
      device.call("save_preset_to_compare_ab_slot");
      break;
  }
}
