import {
  cleanupInternalDrumChains,
  readDevice as readDeviceShared,
} from "../shared/device-reader.js";

/**
 * Read information about a specific device by ID.
 *
 * HISTORICAL NOTE (Sept 2025):
 * This tool was created as a fallback mechanism for a hypothetical edge case where
 * read-track would fail due to massive numbers of nested rack devices. In practice,
 * this has never been needed because:
 *
 * 1. Performance improvements (chunking, better timeouts) solved the underlying issues
 * 2. The overhauled include system with sensible defaults prevents most timeouts
 * 3. ppal-init separates initialization from reading, reducing initial load
 * 4. No real-world use case has emerged requiring direct device access by ID
 *
 * The tool is implemented but not exposed via MCP to save context window space.
 * If you ever encounter projects where read-track consistently fails due to
 * device complexity, this tool can be re-enabled by uncommenting its registration
 * in create-mcp-server.js.
 *
 * Last verified unused: Sept 2025 (searched all conversations, zero organic usage)
 */
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

  const deviceInfo = readDeviceShared(device, {
    includeChains,
    includeDrumChains,
  });

  // Clean up internal _processedDrumChains property
  return cleanupInternalDrumChains(deviceInfo);
}
