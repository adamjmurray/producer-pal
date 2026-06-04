// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import {
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
} from "./helpers/device-reader-helpers.ts";
import { extractDevicePath } from "./helpers/path/device-path-helpers.ts";
import { probeSimplerSample } from "./simpler-sample.ts";
import {
  readSpecializedActions,
  readSpecializedModulations,
  readSpecializedOptions,
  readSpecializedParams,
} from "./specialized/specialized-device-registry.ts";

export interface ReadDeviceOptions {
  includeChains?: boolean;
  includeReturnChains?: boolean;
  includeDrumPads?: boolean;
  includeParams?: boolean;
  includeParamValues?: boolean;
  includeSample?: boolean;
  includeOptions?: boolean;
  includeActions?: boolean;
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
    includeSample = false,
    includeOptions = false,
    includeActions = false,
    paramSearch,
    depth = 0,
    maxDepth = 4,
    parentPath,
  } = options;

  if (depth > maxDepth) {
    console.warn(`Maximum recursion depth (${maxDepth}) exceeded`);

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

  // collapsed — kept for potential future use
  // const deviceView = LiveAPI.from(`${device.path} view`);
  // if (
  //   deviceView.exists() &&
  //   (deviceView.getProperty("is_collapsed") as number) > 0
  // ) {
  //   deviceInfo.collapsed = true;
  // }

  // Process chains for rack devices
  processDeviceChains(device, deviceInfo, deviceType, {
    includeChains,
    includeReturnChains,
    includeDrumPads,
    depth,
    maxDepth,
    readDeviceFn: readDevice,
    devicePath: path ?? undefined,
  });

  appendDeviceDetails(device, deviceInfo, {
    className,
    includeParams,
    includeParamValues,
    includeSample,
    includeOptions,
    includeActions,
    paramSearch,
  });

  return deviceInfo;
}

interface DeviceDetailOptions {
  className: string;
  includeParams: boolean;
  includeParamValues: boolean;
  includeSample: boolean;
  includeOptions: boolean;
  includeActions: boolean;
  paramSearch: string | undefined;
}

/**
 * Append optional detail sections (macro/AB state, parameters, the focused
 * Simpler sample file path, and dynamic catalogs) to a device info object, per
 * the requested includes.
 * @param device - LiveAPI device object
 * @param deviceInfo - Device info object to mutate
 * @param opts - Which detail sections to include
 */
function appendDeviceDetails(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  opts: DeviceDetailOptions,
): void {
  if (opts.includeParams) {
    // Variation/macro info for racks; A/B Compare state (each spreads an empty
    // object when not applicable).
    Object.assign(deviceInfo, readMacroVariations(device));
    Object.assign(deviceInfo, readABCompare(device));
    appendParameters(
      device,
      deviceInfo,
      opts.includeParamValues,
      opts.paramSearch,
    );
  }

  if (opts.includeSample) {
    // Focused discovery view: the Simpler sample file path as a flat top-level
    // `sample` field, optimized for scanning many devices at once (e.g. every
    // pad in a drum rack). gainDb, multi-sample state, and the other Simpler
    // params live in the full `params` set, not here. Independent of
    // includeParams so include:["*"] (and explicitly requesting both) still
    // emits the top-level field — redundant with the `sample` param entry, but
    // least-surprising.
    const probe = probeSimplerSample(device, opts.className);

    if (probe.kind === "single") {
      deviceInfo.sample = probe.path;
    }
  }

  // Dynamic catalogs (opt-in; only devices that contribute add anything).
  if (opts.includeOptions) {
    appendOptions(device, deviceInfo);
  }

  // Available actions for the device's specialized class (opt-in discovery).
  if (opts.includeActions) {
    const actions = readSpecializedActions(device);

    if (actions.length > 0) {
      deviceInfo.actions = actions;
    }
  }
}

/**
 * Append DeviceParameters and specialized pseudo-params to a device info object.
 * @param device - LiveAPI device object
 * @param deviceInfo - Device info object to mutate
 * @param includeValues - Whether to include current param values
 * @param paramSearch - Optional case-insensitive name filter
 */
function appendParameters(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  includeValues: boolean,
  paramSearch: string | undefined,
): void {
  const parameters = readDeviceParameters(device, {
    includeValues,
    search: paramSearch,
  });
  const pseudoParams = readSpecializedParams(device, paramSearch);

  deviceInfo.parameters = [...pseudoParams, ...parameters];
}

/**
 * Append dynamic catalog data and modulation-matrix state (the `options`
 * include) to a device info object. Both are opt-in because the matrix scan
 * costs many Live API calls; only request it when working the mod matrix.
 * @param device - LiveAPI device object
 * @param deviceInfo - Device info object to mutate
 */
function appendOptions(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
): void {
  const deviceOptions = readSpecializedOptions(device);

  if (Object.keys(deviceOptions).length > 0) {
    deviceInfo.options = deviceOptions;
  }

  // Current modulation-matrix routes (Wavetable only; undefined otherwise).
  const modulations = readSpecializedModulations(device);

  if (modulations != null) {
    deviceInfo.modulations = modulations;
  }
}
