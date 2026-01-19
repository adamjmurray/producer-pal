import { midiToNoteName, noteNameToMidi } from "#src/shared/pitch.js";
import { STATE } from "#src/tools/constants.js";
import {
  cleanupInternalDrumPads,
  readDevice as readDeviceShared,
} from "#src/tools/shared/device/device-reader.js";
import { buildChainInfo } from "#src/tools/shared/device/helpers/device-reader-helpers.js";
import { resolvePathToLiveApi } from "#src/tools/shared/device/helpers/path/device-path-helpers.js";
import { validateExclusiveParams } from "#src/tools/shared/validation/id-validation.js";

// ============================================================================
// Helper functions (placed after main export per code organization rules)
// ============================================================================

/**
 * Read information about a specific device by ID or path
 * @param {object} args - The parameters
 * @param {string} [args.deviceId] - Device ID to read
 * @param {string} [args.path] - Device/chain/drum-pad path
 * @param {string[]} args.include - Array of data to include in the response
 * @param {string} [args.paramSearch] - Filter parameters by substring match on name
 * @param {Partial<ToolContext>} [_context] - Internal context object (unused)
 * @returns {Record<string, unknown>} Device, chain, or drum pad information
 */
export function readDevice(
  { deviceId, path, include = ["chains"], paramSearch },
  _context = {},
) {
  validateExclusiveParams(deviceId, path, "deviceId", "path");

  const includeChains = include.includes("*") || include.includes("chains");
  const includeReturnChains =
    include.includes("*") || include.includes("return-chains");
  const includeDrumPads =
    include.includes("*") || include.includes("drum-pads");
  const includeParamValues =
    include.includes("*") || include.includes("param-values");
  const includeParams = includeParamValues || include.includes("params");

  const readOptions = {
    includeChains,
    includeReturnChains,
    includeDrumPads,
    includeParams,
    includeParamValues,
    paramSearch,
  };

  // If deviceId provided, use existing logic
  if (deviceId) {
    return readDeviceById(deviceId, readOptions);
  }

  // Path is required if deviceId is not provided (validated by validateExclusiveParams)
  if (!path) {
    throw new Error("Either deviceId or path must be provided");
  }

  // Resolve path to Live API path and target type
  const resolved = resolvePathToLiveApi(path);

  if (resolved.targetType === "device") {
    return readDeviceByLiveApiPath(resolved.liveApiPath, readOptions);
  }

  if (resolved.targetType === "chain") {
    return readChain(resolved.liveApiPath, path, readOptions);
  }

  if (resolved.targetType === "return-chain") {
    return readChain(resolved.liveApiPath, path, readOptions);
  }

  if (resolved.targetType === "drum-pad") {
    // drumPadNote is guaranteed for drum-pad targetType
    return readDrumPadByPath(
      resolved.liveApiPath,
      /** @type {string} */ (resolved.drumPadNote),
      resolved.remainingSegments,
      path,
      readOptions,
    );
  }

  throw new Error(`Unknown target type: ${resolved.targetType}`);
}

/**
 * @typedef {object} ReadOptions
 * @property {boolean} includeChains
 * @property {boolean} includeReturnChains
 * @property {boolean} includeDrumPads
 * @property {boolean} includeParams
 * @property {boolean} includeParamValues
 * @property {string} [paramSearch]
 */

/**
 * Read device by ID
 * @param {string} deviceId - Device ID to read
 * @param {ReadOptions} options - Read options
 * @returns {Record<string, unknown>} Device information
 */
function readDeviceById(deviceId, options) {
  const device = LiveAPI.from(`id ${deviceId}`);

  if (!device.exists()) {
    throw new Error(`Device with ID ${deviceId} not found`);
  }

  const deviceInfo = readDeviceShared(device, options);

  return /** @type {Record<string, unknown>} */ (
    cleanupInternalDrumPads(deviceInfo)
  );
}

/**
 * Read device by Live API path
 * @param {string} liveApiPath - Live API canonical path
 * @param {ReadOptions} options - Read options
 * @returns {Record<string, unknown>} Device information
 */
function readDeviceByLiveApiPath(liveApiPath, options) {
  const device = LiveAPI.from(liveApiPath);

  if (!device.exists()) {
    throw new Error(`Device not found at path: ${liveApiPath}`);
  }

  const deviceInfo = readDeviceShared(device, options);

  return /** @type {Record<string, unknown>} */ (
    cleanupInternalDrumPads(deviceInfo)
  );
}

/**
 * Read chain information
 * @param {string} liveApiPath - Live API canonical path to the chain
 * @param {string} path - Simplified path for response
 * @param {ReadOptions} options - Read options
 * @returns {Record<string, unknown>} Chain information
 */
function readChain(liveApiPath, path, options) {
  const chain = LiveAPI.from(liveApiPath);

  if (!chain.exists()) {
    throw new Error(`Chain not found at path: ${path}`);
  }

  const devices = /** @type {Record<string, unknown>[]} */ (
    chain.getChildren("devices").map((device) => {
      const deviceInfo = readDeviceShared(device, options);

      return cleanupInternalDrumPads(deviceInfo);
    })
  );

  return buildChainInfo(chain, { path, devices });
}

/**
 * Read drum pad by path
 * @param {string} liveApiPath - Live API path to parent device
 * @param {string} drumPadNote - Note name of the drum pad (e.g., "C1")
 * @param {string[]} remainingSegments - Segments after drum pad in path
 * @param {string} fullPath - Full simplified path for response
 * @param {ReadOptions} options - Read options
 * @returns {Record<string, unknown>} Drum pad, chain, or device information
 */
function readDrumPadByPath(
  liveApiPath,
  drumPadNote,
  remainingSegments,
  fullPath,
  options,
) {
  const device = LiveAPI.from(liveApiPath);

  if (!device.exists()) {
    throw new Error(`Device not found at path: ${liveApiPath}`);
  }

  // Get drum pads and find the one matching the note
  const drumPads = device.getChildren("drum_pads");
  const targetMidiNote = noteNameToMidi(drumPadNote);

  if (targetMidiNote == null) {
    throw new Error(`Invalid drum pad note name: ${drumPadNote}`);
  }

  const pad = drumPads.find((p) => p.getProperty("note") === targetMidiNote);

  if (!pad) {
    throw new Error(`Drum pad ${drumPadNote} not found`);
  }

  // If there are remaining segments, navigate into chains
  if (remainingSegments.length > 0) {
    return readDrumPadNestedTarget(pad, remainingSegments, fullPath, options);
  }

  // Return drum pad info
  return buildDrumPadInfo(pad, fullPath, options);
}

/**
 * Navigate into drum pad chains based on remaining path segments
 * @param {LiveAPI} pad - Drum pad Live API object
 * @param {string[]} remainingSegments - Segments after drum pad in path
 * @param {string} fullPath - Full simplified path for response
 * @param {ReadOptions} options - Read options
 * @returns {Record<string, unknown>} Chain or device information
 */
function readDrumPadNestedTarget(pad, remainingSegments, fullPath, options) {
  const chains = pad.getChildren("chains");
  // Parse chain index from prefixed segment (e.g., "c0" -> 0)
  const chainSegment = /** @type {string} */ (remainingSegments[0]);
  const chainIndex = Number.parseInt(chainSegment.slice(1));

  if (
    Number.isNaN(chainIndex) ||
    chainIndex < 0 ||
    chainIndex >= chains.length
  ) {
    throw new Error(`Invalid chain index in path: ${fullPath}`);
  }

  const chain = /** @type {LiveAPI} */ (chains[chainIndex]);

  // If only chain index, return chain info
  if (remainingSegments.length === 1) {
    return readDrumPadChain(chain, fullPath, options);
  }

  // Navigate to device within chain
  // Parse device index from prefixed segment (e.g., "d0" -> 0)
  const deviceSegment = /** @type {string} */ (remainingSegments[1]);
  const deviceIndex = Number.parseInt(deviceSegment.slice(1));
  const devices = chain.getChildren("devices");

  if (
    Number.isNaN(deviceIndex) ||
    deviceIndex < 0 ||
    deviceIndex >= devices.length
  ) {
    throw new Error(`Invalid device index in path: ${fullPath}`);
  }

  const device = /** @type {LiveAPI} */ (devices[deviceIndex]);
  const deviceInfo = readDeviceShared(device, {
    ...options,
    parentPath: fullPath,
  });

  return /** @type {Record<string, unknown>} */ (
    cleanupInternalDrumPads(deviceInfo)
  );
}

/**
 * Read chain within a drum pad
 * @param {LiveAPI} chain - Chain Live API object
 * @param {string} path - Simplified path for response
 * @param {ReadOptions} options - Read options
 * @returns {Record<string, unknown>} Chain information
 */
function readDrumPadChain(chain, path, options) {
  const devices = /** @type {Record<string, unknown>[]} */ (
    chain
      .getChildren("devices")
      .map((/** @type {LiveAPI} */ device, /** @type {number} */ index) => {
        const devicePath = `${path}/d${index}`;
        const deviceInfo = readDeviceShared(device, {
          ...options,
          parentPath: devicePath,
        });

        return cleanupInternalDrumPads(deviceInfo);
      })
  );

  return buildChainInfo(chain, { path, devices });
}

/**
 * Build drum pad info object
 * @param {LiveAPI} pad - Drum pad Live API object
 * @param {string} path - Simplified path for response
 * @param {ReadOptions} options - Read options
 * @returns {Record<string, unknown>} Drum pad information
 */
function buildDrumPadInfo(pad, path, options) {
  const midiNote = /** @type {number} */ (pad.getProperty("note"));
  const noteName = midiToNoteName(midiNote);

  if (noteName == null) {
    throw new Error(`Invalid MIDI note from drum pad: ${midiNote}`);
  }

  const isMuted = /** @type {number} */ (pad.getProperty("mute")) > 0;
  const isSoloed = /** @type {number} */ (pad.getProperty("solo")) > 0;

  /** @type {Record<string, unknown>} */
  const drumPadInfo = {
    id: pad.id,
    path,
    name: pad.getProperty("name"),
    note: midiNote,
    pitch: noteName,
  };

  if (isSoloed) {
    drumPadInfo.state = STATE.SOLOED;
  } else if (isMuted) {
    drumPadInfo.state = STATE.MUTED;
  }

  // Include chains if requested
  if (options.includeChains || options.includeDrumPads) {
    const chains = pad.getChildren("chains");

    drumPadInfo.chains = chains.map(
      (/** @type {LiveAPI} */ chain, /** @type {number} */ chainIndex) => {
        const chainPath = `${path}/c${chainIndex}`;
        const devices = /** @type {Record<string, unknown>[]} */ (
          chain
            .getChildren("devices")
            .map(
              (
                /** @type {LiveAPI} */ device,
                /** @type {number} */ deviceIndex,
              ) => {
                const devicePath = `${chainPath}/d${deviceIndex}`;
                const deviceInfo = readDeviceShared(device, {
                  ...options,
                  parentPath: devicePath,
                });

                return cleanupInternalDrumPads(deviceInfo);
              },
            )
        );

        return buildChainInfo(chain, {
          path: chainPath,
          devices,
        });
      },
    );
  }

  return drumPadInfo;
}
