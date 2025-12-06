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
 * @returns {object|Array} Updated device info(s)
 */
export function updateDevice({ ids, name, collapsed, params }) {
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
