import { DEVICE_TYPE } from "#src/tools/constants.ts";
import { readParameter, readParameterBasic } from "./device-display-helpers.ts";
import { processDrumPads } from "./device-reader-drum-helpers.ts";
import { buildChainInfo } from "./device-state-helpers.ts";
import {
  buildChainPath,
  buildReturnChainPath,
} from "./path/device-path-helpers.ts";

// Re-export for external use
export { buildChainInfo };

type ReadDeviceFn = (
  device: LiveAPI,
  options: Record<string, unknown>,
) => Record<string, unknown>;

export interface ProcessChainsOptions {
  includeChains: boolean;
  includeReturnChains: boolean;
  includeDrumPads: boolean;
  depth: number;
  maxDepth: number;
  readDeviceFn: ReadDeviceFn;
  devicePath?: string;
}

export interface ReadDeviceParametersOptions {
  includeValues?: boolean;
  search?: string;
}

/**
 * Check if device className is redundant (matches the rack type name)
 * @param deviceType - Device type string
 * @param className - Class display name
 * @returns True if className is redundant
 */
export function isRedundantDeviceClassName(
  deviceType: string,
  className: string,
): boolean {
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
 * @param device - Device object
 * @param deviceInfo - Device info to update
 * @param includeChains - Include chains
 * @param includeDrumPads - Include drum pads
 * @param depth - Current depth
 * @param maxDepth - Max depth
 * @param readDeviceFn - readDevice function
 * @param devicePath - Device path for building nested paths
 */
function processRegularChains(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  includeChains: boolean,
  includeDrumPads: boolean,
  depth: number,
  maxDepth: number,
  readDeviceFn: ReadDeviceFn,
  devicePath: string | undefined,
): void {
  const chains = device.getChildren("chains");
  const hasSoloedChain = chains.some(
    (chain) => (chain.getProperty("solo") as number) > 0,
  );

  if (includeChains) {
    deviceInfo.chains = chains.map((chain, index) => {
      const chainPath = devicePath ? buildChainPath(devicePath, index) : null;
      const devices = chain
        .getChildren("devices")
        .map((chainDevice, deviceIndex) => {
          const nestedDevicePath = chainPath
            ? `${chainPath}/${deviceIndex}`
            : null;

          return readDeviceFn(chainDevice, {
            includeChains,
            includeDrumPads,
            depth: depth + 1,
            maxDepth,
            parentPath: nestedDevicePath,
          });
        });

      return buildChainInfo(chain, { path: chainPath, devices });
    });
  }

  if (hasSoloedChain) {
    deviceInfo.hasSoloedChain = hasSoloedChain;
  }
}

/**
 * Process all chain types for rack devices
 * @param device - Device object
 * @param deviceInfo - Device info to update
 * @param deviceType - Device type
 * @param options - Processing options
 */
export function processDeviceChains(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  deviceType: string,
  options: ProcessChainsOptions,
): void {
  const {
    includeChains,
    includeReturnChains,
    includeDrumPads,
    depth,
    maxDepth,
    readDeviceFn,
    devicePath,
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
        devicePath,
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
      devicePath,
    );
  }
}

/**
 * Process return chains for rack devices (internal helper)
 * @param device - Device object
 * @param deviceInfo - Device info to update
 * @param includeChains - Include chains
 * @param includeReturnChains - Include return chains
 * @param depth - Current depth
 * @param maxDepth - Max depth
 * @param readDeviceFn - readDevice function
 * @param devicePath - Device path for building nested paths
 */
function processReturnChains(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  includeChains: boolean,
  includeReturnChains: boolean,
  depth: number,
  maxDepth: number,
  readDeviceFn: ReadDeviceFn,
  devicePath: string | undefined,
): void {
  const returnChains = device.getChildren("return_chains");

  if (returnChains.length === 0) return;

  deviceInfo.returnChains = returnChains.map((chain, index) => {
    const chainPath = devicePath
      ? buildReturnChainPath(devicePath, index)
      : null;
    const devices = chain.getChildren("devices").map((d, deviceIndex) => {
      const nestedDevicePath = chainPath ? `${chainPath}/${deviceIndex}` : null;

      return readDeviceFn(d, {
        includeChains,
        includeReturnChains,
        depth: depth + 1,
        maxDepth,
        parentPath: nestedDevicePath,
      });
    });

    return buildChainInfo(chain, { path: chainPath, devices });
  });
}

/**
 * Read macro variation and macro info for rack devices
 * @param device - LiveAPI device object
 * @returns Object with variations and/or macros properties if applicable, empty object otherwise
 */
export function readMacroVariations(device: LiveAPI): Record<string, unknown> {
  const canHaveChains = device.getProperty("can_have_chains");

  if (!canHaveChains) {
    return {};
  }

  const result: Record<string, unknown> = {};

  // Variation info
  const variationCount = device.getProperty("variation_count");

  if (variationCount) {
    result.variations = {
      count: variationCount,
      selected: device.getProperty("selected_variation_index"),
    };
  }

  // Macro info
  const visibleMacroCount = device.getProperty("visible_macro_count") as number;

  if (visibleMacroCount > 0) {
    result.macros = {
      count: visibleMacroCount,
      hasMappings: (device.getProperty("has_macro_mappings") as number) > 0,
    };
  }

  return result;
}

/**
 * Read A/B Compare state for devices that support it
 * @param device - LiveAPI device object
 * @returns Object with abCompare property if supported, empty object otherwise
 */
export function readABCompare(device: LiveAPI): Record<string, unknown> {
  const canCompareAB = device.getProperty("can_compare_ab");

  if (!canCompareAB) {
    return {};
  }

  const isUsingB =
    (device.getProperty("is_using_compare_preset_b") as number) > 0;

  return {
    abCompare: isUsingB ? "b" : "a",
  };
}

/**
 * Read all parameters for a device
 * @param device - LiveAPI device object
 * @param options - Reading options
 * @returns Array of parameter info objects
 */
export function readDeviceParameters(
  device: LiveAPI,
  options: ReadDeviceParametersOptions = {},
): Record<string, unknown>[] {
  const { includeValues = false, search } = options;

  let parameters = device.getChildren("parameters");

  // Filter by search string if provided
  if (search) {
    const searchLower = search.toLowerCase().trim();

    parameters = parameters.filter((p) => {
      const name = p.getProperty("name") as string;

      return name.toLowerCase().includes(searchLower);
    });
  }

  return parameters.map(includeValues ? readParameter : readParameterBasic);
}
