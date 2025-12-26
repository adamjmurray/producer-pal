import { midiPitchToName } from "#src/notation/midi-pitch-to-name.js";
import { DEVICE_TYPE, STATE } from "#src/tools/constants.js";
import { readParameter, readParameterBasic } from "./device-display-helpers.js";

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
 * Compute the state of a Live object based on mute/solo properties
 * @param {object} liveObject - Live API object
 * @param {string} category - Category type (default "regular")
 * @returns {string} State value
 */
export function computeState(liveObject, category = "regular") {
  if (category === "master") {
    return STATE.ACTIVE;
  }

  const isMuted = liveObject.getProperty("mute") > 0;
  const isSoloed = liveObject.getProperty("solo") > 0;
  const isMutedViaSolo = liveObject.getProperty("muted_via_solo") > 0;

  if (isSoloed) {
    return STATE.SOLOED;
  }

  if (isMuted && isMutedViaSolo) {
    return STATE.MUTED_ALSO_VIA_SOLO;
  }

  if (isMutedViaSolo) {
    return STATE.MUTED_VIA_SOLO;
  }

  if (isMuted) {
    return STATE.MUTED;
  }

  return STATE.ACTIVE;
}

/**
 * Check if device is an instrument type
 * @param {string} deviceType - Device type string
 * @returns {boolean} True if device is an instrument
 */
export function isInstrumentDevice(deviceType) {
  return (
    deviceType.startsWith(DEVICE_TYPE.INSTRUMENT) ||
    deviceType.startsWith(DEVICE_TYPE.INSTRUMENT_RACK) ||
    deviceType.startsWith(DEVICE_TYPE.DRUM_RACK)
  );
}

/**
 * Check if any device in the list is an instrument
 * @param {Array} devices - Array of device objects
 * @returns {boolean} True if any instrument found
 */
export function hasInstrumentInDevices(devices) {
  if (!devices || devices.length === 0) {
    return false;
  }

  for (const device of devices) {
    if (isInstrumentDevice(device.type)) {
      return true;
    }

    if (device.chains) {
      for (const chain of device.chains) {
        if (chain.devices && hasInstrumentInDevices(chain.devices)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Process a single drum pad to extract drum chain info
 * @param {object} pad - Drum pad object
 * @param {object} chain - Chain object
 * @param {Array} chainDevices - Devices in the chain
 * @param {boolean} includeDrumChains - Include drum chains
 * @param {boolean} includeChains - Include chains
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function (to avoid circular dependency)
 * @returns {object} Processed drum chain info
 */
export function processDrumPad(
  pad,
  chain,
  chainDevices,
  includeDrumChains,
  includeChains,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const readDevice = readDeviceFn;
  const midiNote = pad.getProperty("note");
  const drumChainInfo = {
    name: pad.getProperty("name"),
    note: midiNote,
    pitch: midiPitchToName(midiNote),
    _originalPad: pad,
    _originalChain: chain,
  };
  const isMuted = pad.getProperty("mute") > 0;
  const isSoloed = pad.getProperty("solo") > 0;

  if (isSoloed) {
    drumChainInfo.state = STATE.SOLOED;
  } else if (isMuted) {
    drumChainInfo.state = STATE.MUTED;
  }

  if (includeDrumChains) {
    const processedChainDevices = chainDevices.map((chainDevice) =>
      readDevice(chainDevice, {
        includeChains,
        includeDrumChains,
        depth: depth + 1,
        maxDepth,
      }),
    );

    drumChainInfo.chain = {
      name: chain.getProperty("name"),
      devices: processedChainDevices,
    };
    const chainState = computeState(chain);

    if (chainState !== STATE.ACTIVE) {
      drumChainInfo.chain.state = chainState;
    }

    const hasInstrument = hasInstrumentInDevices(processedChainDevices);

    if (!hasInstrument) {
      drumChainInfo.hasInstrument = false;
    }
  } else {
    const processedChainDevices = chainDevices.map((chainDevice) =>
      readDevice(chainDevice, {
        includeChains: false,
        includeDrumChains: false,
        depth: depth + 1,
        maxDepth,
      }),
    );
    const hasInstrument = hasInstrumentInDevices(processedChainDevices);

    if (!hasInstrument) {
      drumChainInfo.hasInstrument = false;
    }
  }

  return drumChainInfo;
}

/**
 * Update drum chain solo states
 * @param {Array} processedDrumChains - Drum chains to update
 */
export function updateDrumChainSoloStates(processedDrumChains) {
  const hasSoloedDrumChain = processedDrumChains.some(
    (drumChainInfo) => drumChainInfo.state === STATE.SOLOED,
  );

  if (!hasSoloedDrumChain) {
    return;
  }

  processedDrumChains.forEach((drumChainInfo) => {
    if (drumChainInfo.state === STATE.SOLOED) {
      // Keep soloed state as-is
    } else if (drumChainInfo.state === STATE.MUTED) {
      drumChainInfo.state = STATE.MUTED_ALSO_VIA_SOLO;
    } else if (!drumChainInfo.state) {
      drumChainInfo.state = STATE.MUTED_VIA_SOLO;
    }
  });
}

/**
 * Process drum chains for drum rack devices
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {boolean} includeChains - Include chains
 * @param {boolean} includeDrumChains - Include drum chains
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function
 */
export function processDrumChains(
  device,
  deviceInfo,
  includeChains,
  includeDrumChains,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const drumPads = device.getChildren("drum_pads");
  const processedDrumChains = drumPads
    .filter((pad) => pad.getChildIds("chains").length > 0)
    .map((pad) => {
      const chains = pad.getChildren("chains");
      const chain = chains[0];
      const chainDevices = chain.getChildren("devices");

      return processDrumPad(
        pad,
        chain,
        chainDevices,
        includeDrumChains,
        includeChains,
        depth,
        maxDepth,
        readDeviceFn,
      );
    });

  updateDrumChainSoloStates(processedDrumChains);

  if (includeDrumChains) {
    deviceInfo.drumChains = processedDrumChains.map(
      ({ _originalPad, _originalChain, ...drumChainInfo }) => drumChainInfo,
    );
  }

  deviceInfo._processedDrumChains = processedDrumChains;
}

/**
 * Process regular (non-drum) rack chains
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {boolean} includeChains - Include chains
 * @param {boolean} includeDrumChains - Include drum chains
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function
 */
export function processRegularChains(
  device,
  deviceInfo,
  includeChains,
  includeDrumChains,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const readDevice = readDeviceFn;
  const chains = device.getChildren("chains");
  const hasSoloedChain = chains.some((chain) => chain.getProperty("solo") > 0);

  if (includeChains) {
    deviceInfo.chains = chains.map((chain) => {
      const chainInfo = {
        name: chain.getProperty("name"),
      };
      const chainState = computeState(chain);

      if (chainState !== STATE.ACTIVE) {
        chainInfo.state = chainState;
      }

      chainInfo.devices = chain.getChildren("devices").map((chainDevice) =>
        readDevice(chainDevice, {
          includeChains,
          includeDrumChains,
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
 * Process return chains for rack devices
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {string} deviceType - Device type
 * @param {boolean} includeChains - Include chains
 * @param {boolean} includeDrumChains - Include drum chains
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function
 */
export function processReturnChains(
  device,
  deviceInfo,
  deviceType,
  includeChains,
  includeDrumChains,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const readDevice = readDeviceFn;
  const returnChains = device.getChildren("return_chains");

  if (returnChains.length === 0) {
    return;
  }

  deviceInfo.returnChains = returnChains.map((chain) => {
    const returnChainInfo = {
      name: chain.getProperty("name"),
    };
    const chainState = computeState(chain);

    if (chainState !== STATE.ACTIVE) {
      returnChainInfo.state = chainState;
    }

    const shouldIncludeDevices =
      deviceType !== DEVICE_TYPE.DRUM_RACK || includeDrumChains;

    if (shouldIncludeDevices) {
      returnChainInfo.devices = chain
        .getChildren("devices")
        .map((chainDevice) =>
          readDevice(chainDevice, {
            includeChains,
            includeDrumChains,
            depth: depth + 1,
            maxDepth,
          }),
        );
    }

    return returnChainInfo;
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
