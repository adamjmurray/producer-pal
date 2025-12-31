import { noteNameToMidi, isValidNoteName } from "#src/shared/pitch.js";
import * as console from "#src/shared/v8-max-console.js";
import { isPanLabel } from "#src/tools/shared/device/helpers/device-display-helpers.js";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/device-path-helpers.js";

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
 * @param {object} device - LiveAPI device object
 * @param {string} toPath - Target path
 */
export function moveDeviceToPath(device, toPath) {
  const { container, position } = resolveInsertionPath(toPath);

  if (!container || !container.exists()) {
    throw new Error(
      `updateDevice: move target at path "${toPath}" does not exist`,
    );
  }

  const liveSet = new LiveAPI("live_set");
  const deviceId = device.id.startsWith("id ") ? device.id : `id ${device.id}`;
  const containerId = container.id.startsWith("id ")
    ? container.id
    : `id ${container.id}`;

  liveSet.call("move_device", deviceId, containerId, position ?? 0);
}

/**
 * Move a drum chain to a different pad by updating in_note
 * @param {object} chain - LiveAPI drum chain object
 * @param {string} toPath - Target drum pad path
 * @param {boolean} moveEntirePad - If true, move all chains with same in_note
 */
export function moveDrumChainToPath(chain, toPath, moveEntirePad) {
  const targetNote = parseDrumPadNoteFromPath(toPath);

  if (targetNote == null) {
    throw new Error(`updateDevice: toPath "${toPath}" is not a drum pad path`);
  }

  const targetInNote = targetNote === "*" ? -1 : noteNameToMidi(targetNote);

  if (targetInNote == null) {
    throw new Error(`updateDevice: invalid note "${targetNote}" in toPath`);
  }

  if (moveEntirePad) {
    const sourceInNote = chain.getProperty("in_note");
    const drumRackPath = chain.path.replace(/ chains \d+$/, "");
    const drumRack = new LiveAPI(drumRackPath);
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
 * @param {object} device - Live API device object
 * @param {boolean} collapsed - Whether to collapse the device view
 */
export function updateCollapsedState(device, collapsed) {
  const deviceView = new LiveAPI(`${device.path} view`);

  if (deviceView.exists()) {
    deviceView.set("is_collapsed", collapsed ? 1 : 0);
  }
}

// ============================================================================
// Parameter values
// ============================================================================

/**
 * Set parameter values from JSON string
 * @param {string} paramsJson - JSON object mapping param IDs to values
 */
export function setParamValues(paramsJson) {
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
  if (isValidNoteName(inputValue)) {
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

// ============================================================================
// Macro variations
// ============================================================================

/**
 * Update macro variation state for rack devices
 * @param {object} device - Live API device object
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

// ============================================================================
// Macro count
// ============================================================================

/**
 * Update visible macro count for rack devices.
 * Macros are added/removed in pairs, so odd counts are rounded up to the next even.
 * @param {object} device - Live API device object
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

// ============================================================================
// A/B Compare
// ============================================================================

/**
 * Update A/B Compare state for devices that support it
 * @param {object} device - Live API device object
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
