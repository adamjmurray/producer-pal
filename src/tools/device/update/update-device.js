import * as console from "#src/shared/v8-max-console.js";
import {
  isPanLabel,
  isNoteName,
  noteNameToMidi,
} from "#src/tools/shared/device/helpers/device-display-helpers.js";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.js";

/**
 * Update device(s) by ID
 * @param {object} args - The parameters
 * @param {string} args.ids - Comma-separated device ID(s)
 * @param {string} [args.name] - Device display name
 * @param {boolean} [args.collapsed] - Collapse/expand device view
 * @param {string} [args.params] - JSON: {"paramId": value, ...} - values in display units
 * @param {string} [args.macroVariation] - Rack variation action
 * @param {number} [args.macroVariationIndex] - Rack variation index
 * @param {number} [args.macroCount] - Rack visible macro count (0-16)
 * @param {string} [args.abCompare] - A/B Compare action: a, b, or save
 * @returns {object|Array} Updated device info(s)
 */
export function updateDevice({
  ids,
  name,
  collapsed,
  params,
  macroVariation,
  macroVariationIndex,
  macroCount,
  abCompare,
}) {
  const deviceIds = parseCommaSeparatedIds(ids);
  const updatedDevices = [];

  for (const id of deviceIds) {
    const device = LiveAPI.from(id);

    if (!device.exists()) {
      console.error(`updateDevice: id "${id}" does not exist`);
      continue;
    }

    if (name != null) {
      device.set("name", name);
    }

    if (collapsed != null) {
      updateCollapsedState(device, collapsed);
    }

    if (params != null) {
      setParamValues(params);
    }

    if (macroVariation != null || macroVariationIndex != null) {
      updateMacroVariation(device, macroVariation, macroVariationIndex);
    }

    if (macroCount != null) {
      updateMacroCount(device, macroCount);
    }

    if (abCompare != null) {
      updateABCompare(device, abCompare);
    }

    updatedDevices.push({ id: device.id });
  }

  if (updatedDevices.length === 0) {
    return [];
  }

  return updatedDevices.length === 1 ? updatedDevices[0] : updatedDevices;
}

function updateCollapsedState(device, collapsed) {
  const deviceView = new LiveAPI(`${device.path} view`);

  if (deviceView.exists()) {
    deviceView.set("is_collapsed", collapsed ? 1 : 0);
  }
}

function setParamValues(paramsJson) {
  const paramValues = JSON.parse(paramsJson);

  for (const [paramId, inputValue] of Object.entries(paramValues)) {
    const param = LiveAPI.from(paramId);

    if (!param.exists()) {
      console.error(`updateDevice: param id "${paramId}" does not exist`);
      continue;
    }

    setParamValue(param, inputValue);
  }
}

function setParamValue(param, inputValue) {
  const isQuantized = param.getProperty("is_quantized") > 0;

  // 1. Enum - string input with quantized param
  if (isQuantized && typeof inputValue === "string") {
    const valueItems = param.get("value_items");
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
  if (isNoteName(inputValue)) {
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
  const currentLabel = param.call("str_for_value", currentValue);

  if (isPanLabel(currentLabel)) {
    const min = param.getProperty("min");
    const max = param.getProperty("max");
    // Convert -1 to 1 → internal range
    const internalValue = ((inputValue + 1) / 2) * (max - min) + min;

    param.set("value", internalValue);

    return;
  }

  // 4. All other numeric - set display_value directly
  param.set("display_value", inputValue);
}

/**
 * Update macro variation state for rack devices
 * @param {object} device - Live API device object
 * @param {string} [action] - Variation action: create, load, delete, revert, randomize
 * @param {number} [index] - Variation index for load/delete (0-based)
 */
function updateMacroVariation(device, action, index) {
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

function setVariationIndex(device, action, index) {
  if ((action !== "load" && action !== "delete") || index == null) {
    return true;
  }

  const variationCount = device.getProperty("variation_count");

  if (index >= variationCount) {
    console.error(
      `updateDevice: variation index ${index} out of range (${variationCount} available)`,
    );

    return false;
  }

  device.set("selected_variation_index", index);

  return true;
}

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

/**
 * Update visible macro count for rack devices.
 * Macros are added/removed in pairs, so odd counts are rounded up to the next even.
 * @param {object} device - Live API device object
 * @param {number} targetCount - Target number of visible macros (0-16)
 */
function updateMacroCount(device, targetCount) {
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

  const currentCount = device.getProperty("visible_macro_count");
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

/**
 * Update A/B Compare state for devices that support it
 * @param {object} device - Live API device object
 * @param {string} action - "a", "b", or "save"
 */
function updateABCompare(device, action) {
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
