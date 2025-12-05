import * as console from "#src/shared/v8-max-console.js";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.js";

/**
 * Update device(s) by ID
 * @param {object} args - The parameters
 * @param {string} args.ids - Comma-separated device ID(s)
 * @param {string} [args.name] - Device display name
 * @param {boolean} [args.collapsed] - Collapse/expand device view
 * @returns {object|Array} Updated device info(s)
 */
export function updateDevice({ ids, name, collapsed }) {
  const deviceIds = parseCommaSeparatedIds(ids);
  const updatedDevices = [];

  for (const id of deviceIds) {
    const device = LiveAPI.from(id);

    if (!device.exists()) {
      console.error(`updateDevice: id "${id}" does not exist`);
      continue;
    }

    // Update name if provided
    if (name != null) {
      device.set("name", name);
    }

    // Update collapsed state if provided
    if (collapsed != null) {
      const deviceView = new LiveAPI(`${device.path} view`);
      if (deviceView.exists()) {
        deviceView.set("is_collapsed", collapsed ? 1 : 0);
      }
    }

    updatedDevices.push({ id: device.id });
  }

  if (updatedDevices.length === 0) {
    return [];
  }
  return updatedDevices.length === 1 ? updatedDevices[0] : updatedDevices;
}
