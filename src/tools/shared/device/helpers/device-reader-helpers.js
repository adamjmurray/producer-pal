import { DEVICE_TYPE, STATE } from "#src/tools/constants.js";
import { readParameter, readParameterBasic } from "./device-display-helpers.js";
import {
  buildChainPath,
  buildReturnChainPath,
  extractDevicePath,
} from "./device-path-helpers.js";
import {
  processDrumPads,
  updateDrumPadSoloStates,
} from "./device-reader-drum-helpers.js";
import {
  computeState,
  hasInstrumentInDevices,
  isInstrumentDevice,
} from "./device-state-helpers.js";

// Re-export for external use
export {
  processDrumPads,
  updateDrumPadSoloStates,
  computeState,
  hasInstrumentInDevices,
  isInstrumentDevice,
};

/**
 * Check if device className is redundant (matches the rack type name)
 * @param {string} deviceType - Device type string
 * @param {string} className - Class display name
 * @returns {boolean} True if className is redundant
 */
export function isRedundantDeviceClassName(deviceType, className) {
  if (deviceType === DEVICE_TYPE.INSTRUMENT_RACK) {
    return className === "Instrument Rack";
  }

  if (deviceType === DEVICE_TYPE.DRUM_RACK) {
    return className === "Drum Rack";
  }

  if (deviceType === DEVICE_TYPE.AUDIO_EFFECT_RACK) {
    return className === "Audio Effect Rack";
  }

  if (deviceType === DEVICE_TYPE.MIDI_EFFECT_RACK) {
    return className === "MIDI Effect Rack";
  }

  return false;
}

/**
 * Process regular (non-drum) rack chains
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {boolean} includeChains - Include chains
 * @param {boolean} includeDrumPads - Include drum pads
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function
 */
export function processRegularChains(
  device,
  deviceInfo,
  includeChains,
  includeDrumPads,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const readDevice = readDeviceFn;
  const chains = device.getChildren("chains");
  const hasSoloedChain = chains.some((chain) => chain.getProperty("solo") > 0);
  const parentPath = extractDevicePath(device.path);

  if (includeChains) {
    deviceInfo.chains = chains.map((chain, index) => {
      const chainPath = parentPath ? buildChainPath(parentPath, index) : null;
      const chainInfo = {
        id: chain.id,
        ...(chainPath && { path: chainPath }),
        name: chain.getProperty("name"),
      };

      const color = chain.getColor();

      if (color) {
        chainInfo.color = color;
      }

      const chainState = computeState(chain);

      if (chainState !== STATE.ACTIVE) {
        chainInfo.state = chainState;
      }

      chainInfo.devices = chain.getChildren("devices").map((chainDevice) =>
        readDevice(chainDevice, {
          includeChains,
          includeDrumPads,
          depth: depth + 1,
          maxDepth,
        }),
      );

      return chainInfo;
    });
  }

  if (hasSoloedChain) {
    deviceInfo.hasSoloedChain = hasSoloedChain;
  }
}

/**
 * Process all chain types for rack devices
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {string} deviceType - Device type
 * @param {object} options - Processing options
 * @param {boolean} options.includeChains - Include regular chains
 * @param {boolean} options.includeReturnChains - Include return chains
 * @param {boolean} options.includeDrumPads - Include drum pads
 * @param {number} options.depth - Current depth
 * @param {number} options.maxDepth - Max depth
 * @param {Function} options.readDeviceFn - readDevice function
 */
export function processDeviceChains(device, deviceInfo, deviceType, options) {
  const {
    includeChains,
    includeReturnChains,
    includeDrumPads,
    depth,
    maxDepth,
    readDeviceFn,
  } = options;

  const isRack = deviceType.includes("rack");

  if (!isRack) {
    return;
  }

  // Process regular chains or drum pads
  if (includeChains || includeDrumPads) {
    if (deviceType === DEVICE_TYPE.DRUM_RACK) {
      processDrumPads(
        device,
        deviceInfo,
        includeChains,
        includeDrumPads,
        depth,
        maxDepth,
        readDeviceFn,
      );
    } else {
      processRegularChains(
        device,
        deviceInfo,
        includeChains,
        includeDrumPads,
        depth,
        maxDepth,
        readDeviceFn,
      );
    }
  }

  // Process return chains (works for all rack types when requested)
  if (includeReturnChains) {
    processReturnChains(
      device,
      deviceInfo,
      includeChains,
      includeReturnChains,
      depth,
      maxDepth,
      readDeviceFn,
    );
  }
}

// Process return chains for rack devices (internal helper)
function processReturnChains(
  device,
  deviceInfo,
  includeChains,
  includeReturnChains,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const returnChains = device.getChildren("return_chains");

  if (returnChains.length === 0) return;

  const parentPath = extractDevicePath(device.path);

  deviceInfo.returnChains = returnChains.map((chain, index) => {
    const chainPath = parentPath
      ? buildReturnChainPath(parentPath, index)
      : null;
    const info = {
      id: chain.id,
      ...(chainPath && { path: chainPath }),
      name: chain.getProperty("name"),
    };

    const color = chain.getColor();

    if (color) {
      info.color = color;
    }

    const chainState = computeState(chain);

    if (chainState !== STATE.ACTIVE) {
      info.state = chainState;
    }

    info.devices = chain.getChildren("devices").map((d) =>
      readDeviceFn(d, {
        includeChains,
        includeReturnChains,
        depth: depth + 1,
        maxDepth,
      }),
    );

    return info;
  });
}

/**
 * Read macro variation and macro info for rack devices
 * @param {object} device - LiveAPI device object
 * @returns {object} Object with variations and/or macros properties if applicable, empty object otherwise
 */
export function readMacroVariations(device) {
  const canHaveChains = device.getProperty("can_have_chains");

  if (!canHaveChains) {
    return {};
  }

  const result = {};

  // Variation info
  const variationCount = device.getProperty("variation_count");

  if (variationCount) {
    result.variations = {
      count: variationCount,
      selected: device.getProperty("selected_variation_index"),
    };
  }

  // Macro info
  const visibleMacroCount = device.getProperty("visible_macro_count");

  if (visibleMacroCount > 0) {
    result.macros = {
      count: visibleMacroCount,
      hasMappings: device.getProperty("has_macro_mappings") > 0,
    };
  }

  return result;
}

/**
 * Read A/B Compare state for devices that support it
 * @param {object} device - LiveAPI device object
 * @returns {object} Object with abCompare property if supported, empty object otherwise
 */
export function readABCompare(device) {
  const canCompareAB = device.getProperty("can_compare_ab");

  if (!canCompareAB) {
    return {};
  }

  const isUsingB = device.getProperty("is_using_compare_preset_b") > 0;

  return {
    abCompare: isUsingB ? "b" : "a",
  };
}

/**
 * Read all parameters for a device
 * @param {object} device - LiveAPI device object
 * @param {object} options - Reading options
 * @param {boolean} options.includeValues - Include full values/metadata
 * @param {string} options.search - Filter by name substring (case-insensitive)
 * @returns {Array} Array of parameter info objects
 */
export function readDeviceParameters(device, options = {}) {
  const { includeValues = false, search } = options;

  let parameters = device.getChildren("parameters");

  // Filter by search string if provided
  if (search) {
    const searchLower = search.toLowerCase().trim();

    parameters = parameters.filter((p) =>
      p.getProperty("name").toLowerCase().includes(searchLower),
    );
  }

  return parameters.map(includeValues ? readParameter : readParameterBasic);
}
