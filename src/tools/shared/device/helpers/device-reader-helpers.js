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
 * Process a single drum pad to extract drum pad info
 * @param {object} pad - Drum pad object
 * @param {Array} chains - Array of chain objects from the pad
 * @param {boolean} includeDrumPads - Include drum pads in output
 * @param {boolean} includeChains - Include chains data in drum pads
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function (to avoid circular dependency)
 * @returns {object} Processed drum pad info
 */
export function processDrumPad(
  pad,
  chains,
  includeDrumPads,
  includeChains,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const readDevice = readDeviceFn;
  const midiNote = pad.getProperty("note");
  const drumPadInfo = {
    name: pad.getProperty("name"),
    note: midiNote,
    pitch: midiPitchToName(midiNote),
    _originalPad: pad,
  };
  const isMuted = pad.getProperty("mute") > 0;
  const isSoloed = pad.getProperty("solo") > 0;

  if (isSoloed) {
    drumPadInfo.state = STATE.SOLOED;
  } else if (isMuted) {
    drumPadInfo.state = STATE.MUTED;
  }

  // Process all chains for hasInstrument check (always needed for drumMap)
  let anyChainHasInstrument = false;
  const processedChains = chains.map((chain) => {
    const chainDevices = chain.getChildren("devices");
    const processedDevices = chainDevices.map((chainDevice) =>
      readDevice(chainDevice, {
        includeChains: includeDrumPads && includeChains,
        includeDrumPads: includeDrumPads && includeChains,
        depth: depth + 1,
        maxDepth,
      }),
    );

    if (hasInstrumentInDevices(processedDevices)) {
      anyChainHasInstrument = true;
    }

    const chainInfo = {
      name: chain.getProperty("name"),
      devices: processedDevices,
    };
    const chainState = computeState(chain);

    if (chainState !== STATE.ACTIVE) {
      chainInfo.state = chainState;
    }

    return chainInfo;
  });

  // Only add chains array when both includeDrumPads and includeChains are true
  if (includeDrumPads && includeChains) {
    drumPadInfo.chains = processedChains;
  }

  if (!anyChainHasInstrument) {
    drumPadInfo.hasInstrument = false;
  }

  return drumPadInfo;
}

/**
 * Update drum pad solo states
 * @param {Array} processedDrumPads - Drum pads to update
 */
export function updateDrumPadSoloStates(processedDrumPads) {
  const hasSoloedDrumPad = processedDrumPads.some(
    (drumPadInfo) => drumPadInfo.state === STATE.SOLOED,
  );

  if (!hasSoloedDrumPad) {
    return;
  }

  processedDrumPads.forEach((drumPadInfo) => {
    if (drumPadInfo.state === STATE.SOLOED) {
      // Keep soloed state as-is
    } else if (drumPadInfo.state === STATE.MUTED) {
      drumPadInfo.state = STATE.MUTED_ALSO_VIA_SOLO;
    } else if (!drumPadInfo.state) {
      drumPadInfo.state = STATE.MUTED_VIA_SOLO;
    }
  });
}

/**
 * Process drum pads for drum rack devices
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {boolean} includeChains - Include chains in drum pads
 * @param {boolean} includeDrumPads - Include drum pads in output
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function
 */
export function processDrumPads(
  device,
  deviceInfo,
  includeChains,
  includeDrumPads,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const drumPads = device.getChildren("drum_pads");
  const processedDrumPads = drumPads
    .filter((pad) => pad.getChildIds("chains").length > 0)
    .map((pad) => {
      const chains = pad.getChildren("chains");

      return processDrumPad(
        pad,
        chains,
        includeDrumPads,
        includeChains,
        depth,
        maxDepth,
        readDeviceFn,
      );
    });

  updateDrumPadSoloStates(processedDrumPads);

  if (includeDrumPads) {
    deviceInfo.drumPads = processedDrumPads.map(
      ({ _originalPad, ...drumPadInfo }) => drumPadInfo,
    );
  }

  deviceInfo._processedDrumPads = processedDrumPads;
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
 * Process return chains for rack devices
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {string} deviceType - Device type
 * @param {boolean} includeChains - Include chains
 * @param {boolean} includeDrumPads - Include drum pads
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function
 */
export function processReturnChains(
  device,
  deviceInfo,
  deviceType,
  includeChains,
  includeDrumPads,
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
      deviceType !== DEVICE_TYPE.DRUM_RACK || includeDrumPads;

    if (shouldIncludeDevices) {
      returnChainInfo.devices = chain
        .getChildren("devices")
        .map((chainDevice) =>
          readDevice(chainDevice, {
            includeChains,
            includeDrumPads,
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
