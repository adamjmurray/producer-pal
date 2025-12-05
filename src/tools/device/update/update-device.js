import * as console from "#src/shared/v8-max-console.js";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.js";

/**
 * Update device(s) by ID
 * @param {object} args - The parameters
 * @param {string} args.ids - Comma-separated device ID(s)
 * @param {string} [args.name] - Device display name
 * @param {boolean} [args.collapsed] - Collapse/expand device view
 * @param {string} [args.params] - JSON: {"paramId": value, ...}
 * @param {string} [args.paramDisplayValues] - JSON: {"paramId": "displayStr", ...}
 * @returns {object|Array} Updated device info(s)
 */
export function updateDevice({
  ids,
  name,
  collapsed,
  params,
  paramDisplayValues,
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

    if (paramDisplayValues != null) {
      setParamDisplayValues(paramDisplayValues);
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
  for (const [paramId, value] of Object.entries(paramValues)) {
    const param = LiveAPI.from(paramId);
    if (param.exists()) {
      param.set("value", value);
    } else {
      console.error(`updateDevice: param id "${paramId}" does not exist`);
    }
  }
}

function setParamDisplayValues(paramDisplayValuesJson) {
  const displayValues = JSON.parse(paramDisplayValuesJson);
  for (const [paramId, displayValue] of Object.entries(displayValues)) {
    const param = LiveAPI.from(paramId);
    if (param.exists()) {
      param.set("display_value", displayValue);
    } else {
      console.error(`updateDevice: param id "${paramId}" does not exist`);
    }
  }
}
