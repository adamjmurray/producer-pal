// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  cleanupInternalDrumPads,
  readDevice as readDeviceShared,
} from "#src/tools/shared/device/device-reader.ts";
import { buildChainInfo } from "#src/tools/shared/device/helpers/device-reader-helpers.ts";
import { drumPadPath } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { resolvePathToLiveApi } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { namedIdParam, namedParam } from "#src/tools/shared/utils.ts";
import { validateExclusiveParams } from "#src/tools/shared/validation/id-validation.ts";
import {
  drumMapReadDepth,
  postProcessDrumMap,
} from "./helpers/read-device-drum-map-helpers.ts";
import {
  buildDrumPadInfo,
  readDrumPadByPath,
} from "./helpers/read-device-drum-pad-helpers.ts";
import { type ReadOptions } from "./helpers/read-device-options.ts";

// ============================================================================
// Helper functions (placed after main export per code organization rules)
// ============================================================================

interface ReadDeviceArgs {
  id?: string;
  /** Hidden alias for id */
  deviceId?: string;
  path?: string;
  include?: string[];
  maxDepth?: number;
  paramSearch?: string;
}

/**
 * Read information about a specific device by ID or path
 * @param args - The parameters
 * @param args.id - Device ID to read
 * @param args.deviceId - Hidden alias for id
 * @param args.path - Device/chain/drum-pad path
 * @param args.include - Array of data to include in the response
 * @param args.maxDepth - Device tree depth for chains/drum-pads
 * @param args.paramSearch - Filter parameters by substring match on name
 * @param context - Internal context object (supplies the active notation)
 * @returns Device, chain, or drum pad information
 */
export function readDevice(
  {
    id,
    deviceId,
    path,
    include = [],
    maxDepth = 0,
    paramSearch,
  }: ReadDeviceArgs,
  context: Partial<ToolContext> = {},
): Record<string, unknown> {
  // A value the schema coerced from a JSON null names nothing, so it must not
  // count as the caller having sent both addressing params.
  deviceId = namedIdParam(id, deviceId, "deviceId");
  path = namedParam(path, "path");

  validateExclusiveParams(deviceId, path, "id", "path");

  const includeAll = include.includes("*");
  const includeChains = includeAll || include.includes("chains");
  const includeReturnChains = includeAll || include.includes("return-chains");
  const includeDrumPads = includeAll || include.includes("drum-pads");
  const includeDrumMap = includeAll || include.includes("drum-map");
  const includeParamValues = includeAll || include.includes("param-values");
  const includeParams = includeParamValues || include.includes("params");
  const includeSample = includeAll || include.includes("sample");
  const includeOptions = includeAll || include.includes("options");
  const includeActions = includeAll || include.includes("actions");

  // Force chain processing internally when drum-map is requested (needed for getDrumMap)
  const chainsForDrumMap = includeDrumMap && !includeChains;

  const readOptions: ReadOptions = {
    includeChains: includeChains || includeDrumMap,
    includeReturnChains,
    includeDrumPads,
    includeDrumMap,
    includeParams,
    includeParamValues,
    includeSample,
    includeOptions,
    includeActions,
    chainsHidden: chainsForDrumMap,
    maxDepth: drumMapReadDepth(maxDepth, includeDrumMap, chainsForDrumMap),
    paramSearch,
  };

  const result = readDeviceTarget(deviceId, path, readOptions);
  const processed = postProcessDrumMap(result, {
    includeDrumMap,
    drumMapExplicit: include.includes("drum-map"),
    chainsForDrumMap,
    includeDrumPads,
    notation: context.notation,
  });

  // Cleanup after drum-map processing (getDrumMap needs _processedDrumPads)
  return cleanupInternalDrumPads(processed) as Record<string, unknown>;
}

/**
 * Route to the appropriate reader based on deviceId or path
 * @param deviceId - Device ID to read
 * @param path - Device/chain/drum-pad path
 * @param options - Read options
 * @returns Device, chain, or drum pad information
 */
function readDeviceTarget(
  deviceId: string | undefined,
  path: string | undefined,
  options: ReadOptions,
): Record<string, unknown> {
  if (deviceId) {
    return readDeviceById(deviceId, options);
  }

  // readDevice's validateExclusiveParams already rejected "neither" (and "both"),
  // so a missing deviceId means the path is present.
  const devicePath = path as string;
  const resolved = resolvePathToLiveApi(devicePath);

  switch (resolved.targetType) {
    case "device":
      return readDeviceByLiveApiPath(resolved.liveApiPath, options);

    case "chain":
    case "return-chain":
      return readChain(resolved.liveApiPath, devicePath, options);

    case "drum-pad":
      return readDrumPadByPath(
        resolved.liveApiPath,
        resolved.drumPadNote as string,
        resolved.remainingSegments,
        devicePath,
        options,
      );

    // Unreachable: every TargetType is handled above, and the `never` keeps it
    // that way if a new one is added.
    /* v8 ignore start -- exhaustive switch: all TargetType values handled above */
    default: {
      const exhaustive: never = resolved.targetType;

      return exhaustive;
    }
    /* v8 ignore stop */
  }
}

/**
 * Read a device, or a drum pad, by ID
 * @param deviceId - Device or DrumPad ID to read
 * @param options - Read options
 * @returns Device or drum pad information
 */
function readDeviceById(
  deviceId: string,
  options: ReadOptions,
): Record<string, unknown> {
  const device = LiveAPI.from(`id ${deviceId}`);

  if (!device.exists()) {
    throw new Error(`Device with ID ${deviceId} not found`);
  }

  // duplicate and delete both hand back pad ids, so reading one has to answer
  // the same shape the path form does. A DrumPad has none of the properties the
  // shared reader wants, and comes back describing nothing.
  if (device.type === "DrumPad") {
    return buildDrumPadInfo(device, drumPadPath(device), options);
  }

  return readDeviceShared(device, options);
}

/**
 * Read device by Live API path
 * @param liveApiPath - Live API canonical path
 * @param options - Read options
 * @returns Device information
 */
function readDeviceByLiveApiPath(
  liveApiPath: string,
  options: ReadOptions,
): Record<string, unknown> {
  const device = LiveAPI.from(liveApiPath);

  if (!device.exists()) {
    throw new Error(`Device not found at path: ${liveApiPath}`);
  }

  return readDeviceShared(device, options);
}

/**
 * Read chain information
 * @param liveApiPath - Live API canonical path to the chain
 * @param path - Simplified path for response
 * @param options - Read options
 * @returns Chain information
 */
function readChain(
  liveApiPath: string,
  path: string,
  options: ReadOptions,
): Record<string, unknown> {
  const chain = LiveAPI.from(liveApiPath);

  if (!chain.exists()) {
    throw new Error(`Chain not found at path: ${path}`);
  }

  const devices = chain
    .getChildren("devices")
    .map((device) => readDeviceShared(device, options));

  return buildChainInfo(chain, { path, devices });
}
