// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  idDoesNotExist,
  idOrPathRequired,
} from "#src/tools/shared/validation/id-validation.ts";
import {
  cleanupInternalDrumPads,
  readDevice as readDeviceShared,
} from "#src/tools/shared/device/device-reader.ts";
import {
  isDeviceTreeType,
  wrongTargetTypeMessage,
} from "#src/tools/shared/device/device-target-types.ts";
import { buildChainInfo } from "#src/tools/shared/device/helpers/device-reading.ts";
import { drumPadPath } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { nothingAtPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { resolvePathToLiveApi } from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  namedIdParam,
  namedParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import {
  readFanOut,
  type ReadResult,
} from "#src/tools/shared/validation/lists/read-fan-out.ts";
import {
  drumMapReadDepth,
  postProcessDrumMap,
} from "./helpers/drum-map-post-processing.ts";
import {
  buildDrumPadInfo,
  readDrumPadByPath,
} from "./helpers/drum-pad-reading.ts";
import { addMappedMacros } from "./helpers/read-mapped-macros.ts";
import { addSimplerSettings } from "./helpers/read-simpler-settings.ts";
import { type ReadOptions } from "./helpers/read-device-options.ts";

// ============================================================================
// Helper functions (placed after main export per code organization rules)
// ============================================================================

interface ReadDeviceArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  /** Hidden alias for id */
  deviceId?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  include?: string[];
  maxDepth?: number;
  paramSearch?: string;
}

/**
 * Read information about the device(s), chain(s), or drum pad(s) a call names
 * @param args - The parameters
 * @param args.id - Comma-separated device or drum pad IDs to read
 * @param args.ids - Hidden alias for id
 * @param args.path - Comma-separated device/chain/drum-pad paths
 * @param args.paths - Hidden alias for path
 * @param context - Internal context object (supplies the active notation)
 * @returns One device, or one entry per target named; a promise, because a
 *   rack's mapped macros and a Simpler's pitch bend ranges come from the remote
 *   script
 */
export async function readDevice(
  args: ReadDeviceArgs,
  context: Partial<ToolContext> = {},
): Promise<ReadResult<Record<string, unknown>>> {
  const result = readFanOut(
    args,
    { object: "device", idAlias: "deviceId", deadline: context.deadline },
    (one) => readOneDevice(one, context),
  );

  // Which macros are mapped, and a Simpler's pitch bend ranges, are the parts of
  // a device read that wait on the remote script, so each is added after the
  // fan-out, once, for every device read. One after the other: awaits never
  // overlap. A remote script that stalled on the first would stall on the second.
  const results = Array.isArray(result) ? result : [result];
  const stalled = await addMappedMacros(results, context.deadline);

  if (!stalled) {
    await addSimplerSettings(results, context.deadline, args.paramSearch);
  }

  return result;
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
export function readOneDevice(
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

  if (deviceId == null && path == null) {
    throw new Error(idOrPathRequired());
  }

  const includeAll = include.includes("*");
  const includeChains = includeAll || include.includes("chains");
  const includeReturnChains = includeAll || include.includes("return-chains");
  // A Drum Rack's chains live under its pads, so asking for chains means the
  // pads with their layers. Small-model mode has no `drum-pads` to ask for.
  const includeDrumPads =
    includeAll || include.includes("drum-pads") || include.includes("chains");
  const includeDrumMap = includeAll || include.includes("drum-map");
  const includeParamValues = includeAll || include.includes("param-values");
  // A search names the params to show, so it needs them on.
  const includeParams =
    includeParamValues || include.includes("params") || paramSearch != null;
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

  // readOneDevice already refused a call naming neither, so a missing deviceId
  // means the path is present.
  const devicePath = path as string;
  const resolved = resolvePathToLiveApi(devicePath);

  // A type segment that named no device says what the container holds instead,
  // whatever the substituted position would have resolved to.
  if (resolved.namesNothing != null) {
    throw new Error(nothingAtPath(devicePath, resolved.namesNothing));
  }

  switch (resolved.targetType) {
    case "device":
      return readDeviceByLiveApiPath(resolved.liveApiPath, devicePath, options);

    case "chain":
    case "return-chain":
      return readChain(resolved.liveApiPath, resolved.path, options);

    case "drum-pad":
      return readDrumPadByPath(
        resolved.liveApiPath,
        resolved.drumPadNote as string,
        resolved.remainingSegments,
        resolved.path,
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
 * Read a device, chain, or drum pad by ID
 * @param deviceId - Device, chain or DrumPad ID to read
 * @param options - Read options
 * @returns Device or drum pad information
 */
function readDeviceById(
  deviceId: string,
  options: ReadOptions,
): Record<string, unknown> {
  const device = LiveAPI.from(`id ${deviceId}`);

  if (!device.exists()) {
    throw new Error(idDoesNotExist(deviceId));
  }

  // duplicate and delete both hand back pad ids, so reading one has to answer
  // the same shape the path form does. A DrumPad has none of the properties the
  // shared reader wants, and comes back describing nothing.
  if (device.type === "DrumPad") {
    return buildDrumPadInfo(device, drumPadPath(device), options);
  }

  // Chain ids come out of `chains` reads, so they read back like a chain path.
  if (device.type === "Chain" || device.type === "DrumChain") {
    return readChainObject(device, objectPathForApi(device) ?? null, options);
  }

  if (!isDeviceTreeType(device.type)) {
    throw new Error(wrongTargetTypeMessage("read", device));
  }

  return readDeviceShared(device, options);
}

/**
 * Read device by Live API path
 * @param liveApiPath - Live API canonical path
 * @param path - The path as the caller wrote it, for the error
 * @param options - Read options
 * @returns Device information
 */
function readDeviceByLiveApiPath(
  liveApiPath: string,
  path: string,
  options: ReadOptions,
): Record<string, unknown> {
  const device = LiveAPI.from(liveApiPath);

  if (!device.exists()) {
    throw new Error(nothingAtPath(path));
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

  return readChainObject(chain, path, options);
}

/**
 * Read a chain that is already in hand
 * @param chain - The chain
 * @param path - Simplified path for response, or null when it has none
 * @param options - Read options
 * @returns Chain information
 */
function readChainObject(
  chain: LiveAPI,
  path: string | null,
  options: ReadOptions,
): Record<string, unknown> {
  const devices = chain
    .getChildren("devices")
    .map((device) => readDeviceShared(device, options));

  return buildChainInfo(chain, { path, devices });
}
