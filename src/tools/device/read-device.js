import {
  cleanupInternalDrumChains,
  readDevice as readDeviceShared,
} from "../shared/device/device-reader.js";

/**
 * Read information about a specific device by ID
 * @param {object} args - The parameters
 * @param {string} args.deviceId - Device ID to read
 * @param {Array} args.include - Array of data to include in the response
 * @returns {object} Device information
 */
export function readDevice({ deviceId, include = ["chains"] }) {
  const device = new LiveAPI(`id ${deviceId}`);

  if (!device.exists()) {
    throw new Error(`Device with ID ${deviceId} not found`);
  }

  const includeChains = include.includes("*") || include.includes("chains");
  const includeDrumChains =
    include.includes("*") || include.includes("drum-chains");
  const includeParams = include.includes("*") || include.includes("params");

  const deviceInfo = readDeviceShared(device, {
    includeChains,
    includeDrumChains,
    includeParams,
  });

  // Clean up internal _processedDrumChains property
  return cleanupInternalDrumChains(deviceInfo);
}
