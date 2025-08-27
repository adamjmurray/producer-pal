// src/tools/read-device.js
import "../../live-api-extensions.js";
import { readDevice as readDeviceShared } from "../shared/device-reader.js";

/**
 * Read information about a specific device by ID
 * @param {Object} args - The parameters
 * @param {string} args.deviceId - Device ID to read
 * @param {Array} args.include - Array of data to include in the response
 * @returns {Object} Device information
 */
export function readDevice({ deviceId, include = ["chains"] }) {
  const device = new LiveAPI(`id ${deviceId}`);

  if (!device.exists()) {
    throw new Error(`Device with ID ${deviceId} not found`);
  }

  const includeChains = include.includes("*") || include.includes("chains");
  const includeDrumChains =
    include.includes("*") || include.includes("drum-chains");

  return readDeviceShared(device, {
    includeChains,
    includeDrumChains,
  });
}
