import * as console from "#src/shared/v8-max-console.js";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.js";
import {
  isRedundantDeviceClassName,
  processDeviceChains,
  readABCompare,
  readDeviceParameters,
  readMacroVariations,
} from "./helpers/device-reader-helpers.js";

/**
 * Determine device type from Live API properties
 * @param {object} device - Live API device object
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
 * Clean up internal _processedDrumPads property from device objects
 * @param {object | Array} obj - Device object or array of devices to clean
 * @returns {object | Array} Cleaned object/array
 */
export function cleanupInternalDrumPads(obj) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanupInternalDrumPads);
  }

  const { _processedDrumPads, ...rest } = obj;

  if (rest.chains) {
    rest.chains = rest.chains.map((chain) => {
      if (chain.devices) {
        return {
          ...chain,
          devices: cleanupInternalDrumPads(chain.devices),
        };
      }

      return chain;
    });
  }

  return rest;
}

/**
 * Extract track-level drum map from the processed device structure
 * @param {Array} devices - Array of processed device objects
 * @returns {object | null} Object mapping pitch names to drum pad names, or null if none found
 */
export function getDrumMap(devices) {
  /**
   * Recursively find drum rack devices in a device list
   * @param {Array} deviceList - Array of device objects to search
   * @returns {Array} - Array of drum rack devices
   */
  function findDrumRacksInDevices(deviceList) {
    const drumRacks = [];

    for (const device of deviceList) {
      if (
        device.type.startsWith(DEVICE_TYPE.DRUM_RACK) &&
        device._processedDrumPads
      ) {
        drumRacks.push(device);
      }

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

  const drumMap = {};

  drumRacks[0]._processedDrumPads.forEach((drumPad) => {
    if (drumPad.hasInstrument !== false) {
      const pitchName = drumPad.pitch;

      drumMap[pitchName] = drumPad.name;
    }
  });

  return Object.keys(drumMap).length > 0 ? drumMap : {};
}

/**
 * Read device information including nested chains for rack devices
 * @param {object} device - Live API device object
 * @param {object} options - Options for reading device
 * @param {boolean} options.includeChains - Include chains in rack devices
 * @param {boolean} options.includeReturnChains - Include return chains in rack devices
 * @param {boolean} options.includeDrumPads - Include drum pads
 * @param {boolean} options.includeParams - Include device parameters
 * @param {number} options.depth - Current recursion depth
 * @param {number} options.maxDepth - Maximum recursion depth
 * @returns {object} Device object with nested structure
 */
export function readDevice(device, options = {}) {
  const {
    includeChains = true,
    includeReturnChains = false,
    includeDrumPads = false,
    includeParams = false,
    includeParamValues = false,
    paramSearch,
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
    id: device.id,
    type: isRedundant ? deviceType : `${deviceType}: ${className}`,
  };

  if (userDisplayName !== className) {
    deviceInfo.name = userDisplayName;
  }

  const isActive = device.getProperty("is_active") > 0;

  if (!isActive) {
    deviceInfo.deactivated = true;
  }

  const deviceView = new LiveAPI(`${device.path} view`);

  if (deviceView.exists() && deviceView.getProperty("is_collapsed") > 0) {
    deviceInfo.collapsed = true;
  }

  // Add variation/macro info for rack devices (spreads empty object if not applicable)
  Object.assign(deviceInfo, readMacroVariations(device));
  // Add A/B Compare state (spreads empty object if device doesn't support it)
  Object.assign(deviceInfo, readABCompare(device));

  // Process chains for rack devices
  processDeviceChains(device, deviceInfo, deviceType, {
    includeChains,
    includeReturnChains,
    includeDrumPads,
    depth,
    maxDepth,
    readDeviceFn: readDevice,
  });

  if (includeParams) {
    deviceInfo.parameters = readDeviceParameters(device, {
      includeValues: includeParamValues,
      search: paramSearch,
    });
  }

  return deviceInfo;
}
