import * as console from "#src/shared/v8-max-console.js";
import {
  DEVICE_CLASS,
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
import { extractDevicePath } from "./helpers/path/device-path-helpers.js";

/**
 * Determine device type from Live API properties
 * @param {LiveAPI} device - Live API device object
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
 * @typedef {object} DeviceWithChains
 * @property {Array<{devices?: unknown[]}>} [chains] - Device chains
 * @property {unknown} [_processedDrumPads] - Internal drum pad data
 */

/**
 * Clean up internal _processedDrumPads property from device objects
 * @param {unknown} obj - Device object or array of devices to clean
 * @returns {unknown} Cleaned object/array
 */
export function cleanupInternalDrumPads(obj) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanupInternalDrumPads);
  }

  const deviceObj = /** @type {DeviceWithChains & Record<string, unknown>} */ (
    obj
  );
  const { _processedDrumPads, chains, ...rest } = deviceObj;
  /** @type {Record<string, unknown>} */
  const result = { ...rest };

  if (Array.isArray(chains)) {
    result.chains = chains.map((chain) => {
      if (
        chain &&
        typeof chain === "object" &&
        "devices" in chain &&
        chain.devices
      ) {
        return {
          ...chain,
          devices: cleanupInternalDrumPads(chain.devices),
        };
      }

      return chain;
    });
  }

  return result;
}

/**
 * @typedef {object} DrumPadInfo
 * @property {string} pitch - Note name (e.g., "C1")
 * @property {string} name - Drum pad name
 * @property {boolean} [hasInstrument] - Whether pad has an instrument
 */

/**
 * @typedef {object} DeviceWithDrumPads
 * @property {string} type - Device type string
 * @property {DrumPadInfo[]} [_processedDrumPads] - Internal drum pad data
 * @property {Array<{devices?: DeviceWithDrumPads[]}>} [chains] - Device chains
 */

/**
 * Extract track-level drum map from the processed device structure
 * @param {DeviceWithDrumPads[]} devices - Array of processed device objects
 * @returns {Record<string, string> | null} Object mapping pitch names to drum pad names, or null if none found
 */
export function getDrumMap(devices) {
  /**
   * Recursively find drum rack devices in a device list
   * @param {DeviceWithDrumPads[]} deviceList - Array of device objects to search
   * @returns {DeviceWithDrumPads[]} - Array of drum rack devices
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

  /** @type {Record<string, string>} */
  const drumMap = {};
  const firstDrumRack = /** @type {NonNullable<typeof drumRacks[0]>} */ (
    drumRacks[0]
  );
  const drumPads = firstDrumRack._processedDrumPads ?? [];

  for (const drumPad of drumPads) {
    if (drumPad.hasInstrument !== false) {
      const noteName = drumPad.pitch;

      drumMap[noteName] = drumPad.name;
    }
  }

  return Object.keys(drumMap).length > 0 ? drumMap : {};
}

/**
 * @typedef {object} ReadDeviceOptions
 * @property {boolean} [includeChains] - Include chains in rack devices (default true)
 * @property {boolean} [includeReturnChains] - Include return chains (default false)
 * @property {boolean} [includeDrumPads] - Include drum pads (default false)
 * @property {boolean} [includeParams] - Include device parameters (default false)
 * @property {boolean} [includeParamValues] - Include parameter values (default false)
 * @property {string} [paramSearch] - Filter parameters by search string
 * @property {number} [depth] - Current recursion depth (default 0)
 * @property {number} [maxDepth] - Maximum recursion depth (default 4)
 * @property {string} [parentPath] - Override path extraction (used for drum pad devices)
 */

/**
 * Read device information including nested chains for rack devices
 * @param {LiveAPI} device - Live API device object
 * @param {ReadDeviceOptions} [options] - Options for reading device
 * @returns {Record<string, unknown>} Device object with nested structure
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
    parentPath,
  } = options;

  if (depth > maxDepth) {
    console.error(`Maximum recursion depth (${maxDepth}) exceeded`);

    return {};
  }

  const deviceType = getDeviceType(device);
  const className = /** @type {string} */ (
    device.getProperty("class_display_name")
  );
  const userDisplayName = /** @type {string} */ (device.getProperty("name"));
  const isRedundant = isRedundantDeviceClassName(deviceType, className);
  // Use parentPath if provided (for devices inside drum pads), otherwise extract from Live API path
  const path = parentPath ?? extractDevicePath(device.path);

  /** @type {Record<string, unknown>} */
  const deviceInfo = {
    id: device.id,
    ...(path && { path }),
    type: isRedundant ? deviceType : `${deviceType}: ${className}`,
  };

  if (userDisplayName !== className) {
    deviceInfo.name = userDisplayName;
  }

  const isActive = /** @type {number} */ (device.getProperty("is_active")) > 0;

  if (!isActive) {
    deviceInfo.deactivated = true;
  }

  const deviceView = LiveAPI.from(`${device.path} view`);

  if (
    deviceView.exists() &&
    /** @type {number} */ (deviceView.getProperty("is_collapsed")) > 0
  ) {
    deviceInfo.collapsed = true;
  }

  // Add variation/macro info for rack devices (spreads empty object if not applicable)
  Object.assign(deviceInfo, readMacroVariations(device));
  // Add A/B Compare state (spreads empty object if device doesn't support it)
  Object.assign(deviceInfo, readABCompare(device));
  // Add Simpler sample path (spreads empty object if not Simpler or no sample)
  Object.assign(deviceInfo, readSimplerSample(device, className));

  // Process chains for rack devices
  processDeviceChains(
    device,
    deviceInfo,
    deviceType,
    /** @type {Parameters<typeof processDeviceChains>[3]} */ ({
      includeChains,
      includeReturnChains,
      includeDrumPads,
      depth,
      maxDepth,
      readDeviceFn: readDevice,
      devicePath: path,
    }),
  );

  if (includeParams) {
    deviceInfo.parameters = readDeviceParameters(device, {
      includeValues: includeParamValues,
      search: paramSearch,
    });
  }

  return deviceInfo;
}

/**
 * Read sample path from Simpler device
 * @param {LiveAPI} device - Live API device object
 * @param {string} className - Device class display name
 * @returns {Record<string, unknown>} Object with sample property, or empty object
 */
function readSimplerSample(device, className) {
  if (className !== DEVICE_CLASS.SIMPLER) {
    return {};
  }

  // Multisample mode doesn't expose a single sample file path
  if (/** @type {number} */ (device.getProperty("multi_sample_mode")) > 0) {
    return { multisample: true };
  }

  const samples = device.getChildren("sample");

  if (samples.length === 0) {
    return {};
  }

  const firstSample = /** @type {LiveAPI} */ (samples[0]);
  const samplePath = firstSample.getProperty("file_path");

  return samplePath ? { sample: samplePath } : {};
}
