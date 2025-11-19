import { midiPitchToName } from "../../notation/midi-pitch-to-name.js";
import * as console from "../../shared/v8-max-console.js";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
  STATE,
} from "../constants.js";

/**
 * Determine device type from Live API properties
 * @param {Object} device - Live API device object
 * @returns {string} Combined device type string
 */
export function getDeviceType(device) {
  const typeValue = device.getProperty("type");
  const canHaveChains = device.getProperty("can_have_chains");
  const canHaveDrumPads = device.getProperty("can_have_drum_pads");

  if (typeValue === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
    if (canHaveDrumPads) {
      return DEVICE_TYPE.DRUM_RACK;
    }
    if (canHaveChains) {
      return DEVICE_TYPE.INSTRUMENT_RACK;
    }
    return DEVICE_TYPE.INSTRUMENT;
  } else if (typeValue === LIVE_API_DEVICE_TYPE_AUDIO_EFFECT) {
    if (canHaveChains) {
      return DEVICE_TYPE.AUDIO_EFFECT_RACK;
    }
    return DEVICE_TYPE.AUDIO_EFFECT;
  } else if (typeValue === LIVE_API_DEVICE_TYPE_MIDI_EFFECT) {
    if (canHaveChains) {
      return DEVICE_TYPE.MIDI_EFFECT_RACK;
    }
    return DEVICE_TYPE.MIDI_EFFECT;
  }

  return "unknown";
}

/**
 * Clean up internal _processedDrumChains property from device objects
 * @param {Object|Array} obj - Device object or array of devices to clean
 * @returns {Object|Array} Cleaned object/array
 */
export function cleanupInternalDrumChains(obj) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanupInternalDrumChains);
  }

  const { _processedDrumChains, ...rest } = obj;

  // Recursively clean chains
  if (rest.chains) {
    rest.chains = rest.chains.map((chain) => {
      if (chain.devices) {
        return {
          ...chain,
          devices: cleanupInternalDrumChains(chain.devices),
        };
      }
      return chain;
    });
  }

  return rest;
}

/**
 * Extract track-level drum map from the processed device structure
 * This maintains API compatibility while using the new device structure as the source of truth
 * @param {Array} devices - Array of processed device objects (output from readDevice)
 * @returns {Object|null} Object mapping pitch names to drum chain names, or null if none found
 */
export function getDrumMap(devices) {
  // Recursively search for drum rack devices in the processed structure
  function findDrumRacksInDevices(deviceList) {
    const drumRacks = [];

    for (const device of deviceList) {
      // Check for internal _processedDrumChains (used for drumMap extraction)
      if (
        device.type.startsWith(DEVICE_TYPE.DRUM_RACK) &&
        device._processedDrumChains
      ) {
        drumRacks.push(device);
      }

      // Check chains for nested drum racks (in case of racks within racks)
      if (device.chains) {
        for (const chain of device.chains) {
          if (chain.devices) {
            drumRacks.push(...findDrumRacksInDevices(chain.devices));
          }
        }
      }
    }

    return drumRacks;
  }

  const drumRacks = findDrumRacksInDevices(devices);

  if (drumRacks.length === 0) {
    return null;
  }

  // Extract drum chains from the first found drum rack (matching original behavior)
  // Include only drum chains that have instrument devices (exclude those with hasInstrument: false)
  const drumMap = {};

  drumRacks[0]._processedDrumChains.forEach((drumChain) => {
    // Only include drum chains that have instruments (exclude those with hasInstrument: false)
    if (drumChain.hasInstrument !== false) {
      const pitchName = drumChain.pitch;
      drumMap[pitchName] = drumChain.name;
    }
  });

  // Return empty object if drum rack exists but has no playable drum chains
  // Return null only if no drum rack devices found at all
  return Object.keys(drumMap).length > 0 ? drumMap : {};
}

/**
 * Check if device className is redundant (matches the rack type name)
 * @param {string} deviceType - Device type string
 * @param {string} className - Class display name
 * @returns {boolean} True if className is redundant
 */
function isRedundantDeviceClassName(deviceType, className) {
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
 * Process a single drum pad to extract drum chain info
 * @param {Object} pad - Drum pad object
 * @param {Object} chain - Chain object from drum pad
 * @param {Array} chainDevices - Devices in the chain
 * @param {boolean} includeDrumChains - Include drum chains in output
 * @param {boolean} includeChains - Include chains for non-drum racks
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Object} Processed drum chain info
 */
function processDrumPad(
  pad,
  chain,
  chainDevices,
  includeDrumChains,
  includeChains,
  depth,
  maxDepth,
) {
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
 * Post-process drum chain states for solo behavior
 * @param {Array} processedDrumChains - Array of processed drum chain info
 */
function updateDrumChainSoloStates(processedDrumChains) {
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
 * Process drum racks and their drum chains
 * @param {Object} device - Live API device object
 * @param {Object} deviceInfo - Device info object to update
 * @param {boolean} includeChains - Include chains for non-drum racks
 * @param {boolean} includeDrumChains - Include drum chains in output
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 */
function processDrumChains(
  device,
  deviceInfo,
  includeChains,
  includeDrumChains,
  depth,
  maxDepth,
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
 * @param {Object} device - Live API device object
 * @param {Object} deviceInfo - Device info object to update
 * @param {boolean} includeChains - Include chains in output
 * @param {boolean} includeDrumChains - Include drum chains
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 */
function processRegularChains(
  device,
  deviceInfo,
  includeChains,
  includeDrumChains,
  depth,
  maxDepth,
) {
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
 * @param {Object} device - Live API device object
 * @param {Object} deviceInfo - Device info object to update
 * @param {string} deviceType - Device type
 * @param {boolean} includeChains - Include chains
 * @param {boolean} includeDrumChains - Include drum chains
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 */
function processReturnChains(
  device,
  deviceInfo,
  deviceType,
  includeChains,
  includeDrumChains,
  depth,
  maxDepth,
) {
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
 * Read device information including nested chains for rack devices
 * @param {Object} device - Live API device object
 * @param {Object} options - Options for reading device
 * @param {boolean} options.includeChains - Include chains in rack devices
 * @param {boolean} options.includeDrumChains - Include drum pad chains and return chains
 * @param {number} options.depth - Current recursion depth
 * @param {number} options.maxDepth - Maximum recursion depth
 * @returns {Object} Device object with nested structure
 */
export function readDevice(device, options = {}) {
  const {
    includeChains = true,
    includeDrumChains = false,
    depth = 0,
    maxDepth = 4,
  } = options;

  if (depth > maxDepth) {
    console.error(`Maximum recursion depth (${maxDepth}) exceeded`);
    return {};
  }

  const deviceType = getDeviceType(device);
  const className = device.getProperty("class_display_name");
  const userDisplayName = device.getProperty("name");

  const isRedundant = isRedundantDeviceClassName(deviceType, className);
  const deviceInfo = {
    type: isRedundant ? deviceType : `${deviceType}: ${className}`,
  };

  if (userDisplayName !== className) {
    deviceInfo.name = userDisplayName;
  }

  const isActive = device.getProperty("is_active") > 0;
  if (!isActive) {
    deviceInfo.deactivated = true;
  }

  if (deviceType.includes("rack") && (includeChains || includeDrumChains)) {
    if (deviceType === DEVICE_TYPE.DRUM_RACK) {
      processDrumChains(
        device,
        deviceInfo,
        includeChains,
        includeDrumChains,
        depth,
        maxDepth,
      );
    } else {
      processRegularChains(
        device,
        deviceInfo,
        includeChains,
        includeDrumChains,
        depth,
        maxDepth,
      );
    }

    if (includeDrumChains) {
      processReturnChains(
        device,
        deviceInfo,
        deviceType,
        includeChains,
        includeDrumChains,
        depth,
        maxDepth,
      );
    }
  }

  return deviceInfo;
}

/**
 * Compute the state of a Live object (track, drum pad, or chain) based on mute/solo properties
 * @param {Object} liveObject - Live API object with mute, solo, and muted_via_solo properties
 * @returns {string} State: "active" | "muted" | "muted-via-solo" | "muted-also-via-solo" | "soloed"
 */
function computeState(liveObject, category = "regular") {
  // Master track doesn't have mute/solo/muted_via_solo properties
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
 * Check if device is an instrument type (instrument, instrument rack, or drum rack)
 * @param {string} deviceType - Device type string (may include className like "instrument (Analog)")
 * @returns {boolean} True if device is an instrument type
 */
function isInstrumentDevice(deviceType) {
  return (
    deviceType.startsWith(DEVICE_TYPE.INSTRUMENT) ||
    deviceType.startsWith(DEVICE_TYPE.INSTRUMENT_RACK) ||
    deviceType.startsWith(DEVICE_TYPE.DRUM_RACK)
  );
}

/**
 * Recursively check if any device in the provided device list is an instrument
 * @param {Array} devices - Array of processed device objects
 * @returns {boolean} True if any instrument device is found (including nested in racks)
 */
function hasInstrumentInDevices(devices) {
  if (!devices || devices.length === 0) {
    return false;
  }

  for (const device of devices) {
    // Check if this device is an instrument
    if (isInstrumentDevice(device.type)) {
      return true;
    }

    // Recursively check chains for rack devices
    if (device.chains) {
      for (const chain of device.chains) {
        if (chain.devices && hasInstrumentInDevices(chain.devices)) {
          return true;
        }
      }
    }

    // For drum racks, we don't need to check drumPads here since we're checking
    // individual drum pad chains, not the entire drum rack structure
  }

  return false;
}
