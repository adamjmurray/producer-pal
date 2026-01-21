import * as console from "#src/shared/v8-max-console.ts";
import {
  DEVICE_CLASS,
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";
import {
  isRedundantDeviceClassName,
  processDeviceChains,
  readABCompare,
  readDeviceParameters,
  readMacroVariations,
  type ProcessChainsOptions,
} from "./helpers/device-reader-helpers.ts";
import { extractDevicePath } from "./helpers/path/device-path-helpers.ts";

export interface ReadDeviceOptions {
  includeChains?: boolean;
  includeReturnChains?: boolean;
  includeDrumPads?: boolean;
  includeParams?: boolean;
  includeParamValues?: boolean;
  paramSearch?: string;
  depth?: number;
  maxDepth?: number;
  parentPath?: string;
}

interface DeviceWithChains {
  chains?: Array<{ devices?: unknown[] }>;
  _processedDrumPads?: unknown;
}

interface DrumPadInfo {
  pitch: string;
  name: string;
  hasInstrument?: boolean;
}

export interface DeviceWithDrumPads {
  type: string;
  _processedDrumPads?: DrumPadInfo[];
  chains?: Array<{ devices?: DeviceWithDrumPads[] }>;
}

/**
 * Determine device type from Live API properties
 * @param device - Live API device object
 * @returns Combined device type string
 */
export function getDeviceType(device: LiveAPI): string {
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
 * @param obj - Device object or array of devices to clean
 * @returns Cleaned object/array
 */
export function cleanupInternalDrumPads(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanupInternalDrumPads);
  }

  const deviceObj = obj as DeviceWithChains & Record<string, unknown>;
  const { _processedDrumPads, chains, ...rest } = deviceObj;
  const result: Record<string, unknown> = { ...rest };

  if (Array.isArray(chains)) {
    result.chains = chains.map((chain) => {
      if (typeof chain === "object" && "devices" in chain && chain.devices) {
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
 * Extract track-level drum map from the processed device structure
 * @param devices - Array of processed device objects
 * @returns Object mapping pitch names to drum pad names, or null if none found
 */
export function getDrumMap(
  devices: DeviceWithDrumPads[],
): Record<string, string> | null {
  /**
   * Recursively find drum rack devices in a device list
   * @param deviceList - Array of device objects to search
   * @returns Array of drum rack devices
   */
  function findDrumRacksInDevices(
    deviceList: DeviceWithDrumPads[],
  ): DeviceWithDrumPads[] {
    const drumRacks: DeviceWithDrumPads[] = [];

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

  const drumMap: Record<string, string> = {};
  const firstDrumRack = assertDefined(drumRacks[0], "first drum rack");
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
 * Read device information including nested chains for rack devices
 * @param device - Live API device object
 * @param options - Options for reading device
 * @returns Device object with nested structure
 */
export function readDevice(
  device: LiveAPI,
  options: ReadDeviceOptions = {},
): Record<string, unknown> {
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
  const className = device.getProperty("class_display_name") as string;
  const userDisplayName = device.getProperty("name") as string;
  const isRedundant = isRedundantDeviceClassName(deviceType, className);
  // Use parentPath if provided (for devices inside drum pads), otherwise extract from Live API path
  const path = parentPath ?? extractDevicePath(device.path);

  const deviceInfo: Record<string, unknown> = {
    id: device.id,
    ...(path && { path }),
    type: isRedundant ? deviceType : `${deviceType}: ${className}`,
  };

  if (userDisplayName !== className) {
    deviceInfo.name = userDisplayName;
  }

  const isActive = (device.getProperty("is_active") as number) > 0;

  if (!isActive) {
    deviceInfo.deactivated = true;
  }

  const deviceView = LiveAPI.from(`${device.path} view`);

  if (
    deviceView.exists() &&
    (deviceView.getProperty("is_collapsed") as number) > 0
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
  processDeviceChains(device, deviceInfo, deviceType, {
    includeChains,
    includeReturnChains,
    includeDrumPads,
    depth,
    maxDepth,
    readDeviceFn: readDevice,
    devicePath: path ?? undefined,
  } as ProcessChainsOptions);

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
 * @param device - Live API device object
 * @param className - Device class display name
 * @returns Object with sample property, or empty object
 */
function readSimplerSample(
  device: LiveAPI,
  className: string,
): Record<string, unknown> {
  if (className !== DEVICE_CLASS.SIMPLER) {
    return {};
  }

  // Multisample mode doesn't expose a single sample file path
  if ((device.getProperty("multi_sample_mode") as number) > 0) {
    return { multisample: true };
  }

  const samples = device.getChildren("sample");

  if (samples.length === 0) {
    return {};
  }

  const firstSample = assertDefined(samples[0], "first sample");
  const samplePath = firstSample.getProperty("file_path");

  return samplePath ? { sample: samplePath } : {};
}
