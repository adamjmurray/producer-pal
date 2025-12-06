import {
  cleanupInternalDrumChains,
  readDevice as readDeviceShared,
} from "../shared/device/device-reader.js";

/**
 * Read information about a specific device by ID
 * @param {object} args - The parameters
 * @param {string} args.deviceId - Device ID to read
 * @param {Array} args.include - Array of data to include in the response
 * @param {string} [args.paramSearch] - Filter parameters by substring match on name
 * @returns {object} Device information
 */
export function readDevice({ deviceId, include = ["chains"], paramSearch }) {
  const device = new LiveAPI(`id ${deviceId}`);

  if (!device.exists()) {
    throw new Error(`Device with ID ${deviceId} not found`);
  }

  const includeChains = include.includes("*") || include.includes("chains");
  const includeDrumChains =
    include.includes("*") || include.includes("drum-chains");
  const includeParamValues =
    include.includes("*") || include.includes("param-values");
  const includeParams = includeParamValues || include.includes("params");

  const deviceInfo = readDeviceShared(device, {
    includeChains,
    includeDrumChains,
    includeParams,
    includeParamValues,
    paramSearch,
  });

  // Clean up internal _processedDrumChains property
  return cleanupInternalDrumChains(deviceInfo);
}
