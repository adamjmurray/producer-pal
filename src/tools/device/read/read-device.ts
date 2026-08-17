// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import { type Notation } from "#src/shared/notation.ts";
import { midiToNoteName, noteNameToMidi } from "#src/shared/pitch.ts";
import { STATE } from "#src/tools/constants.ts";
import {
  cleanupInternalDrumPads,
  getDrumMap,
  readDevice as readDeviceShared,
  type DeviceWithDrumPads,
} from "#src/tools/shared/device/device-reader.ts";
import { buildChainInfo } from "#src/tools/shared/device/helpers/device-reader-helpers.ts";
import { navigateRemainingSegments } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { resolvePathToLiveApi } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { validateExclusiveParams } from "#src/tools/shared/validation/id-validation.ts";

// ============================================================================
// Helper functions (placed after main export per code organization rules)
// ============================================================================

interface ReadDeviceArgs {
  deviceId?: string;
  path?: string;
  include?: string[];
  maxDepth?: number;
  paramSearch?: string;
}

interface ReadOptions {
  includeChains: boolean;
  includeReturnChains: boolean;
  includeDrumPads: boolean;
  includeDrumMap: boolean;
  includeParams: boolean;
  includeParamValues: boolean;
  includeSample: boolean;
  includeOptions: boolean;
  includeActions: boolean;
  maxDepth: number;
  paramSearch?: string;
}

/**
 * Read information about a specific device by ID or path
 * @param args - The parameters
 * @param args.deviceId - Device ID to read
 * @param args.path - Device/chain/drum-pad path
 * @param args.include - Array of data to include in the response
 * @param args.maxDepth - Device tree depth for chains/drum-pads
 * @param args.paramSearch - Filter parameters by substring match on name
 * @param context - Internal context object (supplies the active notation)
 * @returns Device, chain, or drum pad information
 */
export function readDevice(
  { deviceId, path, include = [], maxDepth = 0, paramSearch }: ReadDeviceArgs,
  context: Partial<ToolContext> = {},
): Record<string, unknown> {
  validateExclusiveParams(deviceId, path, "deviceId", "path");

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
    // drum-map needs depth >= 1 to detect instruments in drum pad chains
    maxDepth: includeDrumMap ? Math.max(1, maxDepth) : maxDepth,
    paramSearch,
  };

  const result = readDeviceTarget(deviceId, path, readOptions);
  const processed = postProcessDrumMap(
    result,
    includeDrumMap,
    chainsForDrumMap,
    context.notation,
  );

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
 * Add drum map to result and strip internally-fetched chain data
 * @param result - Device result to post-process
 * @param includeDrumMap - Whether drum-map was requested
 * @param chainsForDrumMap - Whether chains were fetched only for drum map building
 * @param notation - Active notation; controls whether drum-map keys are drum names
 * @returns Post-processed result
 */
function postProcessDrumMap(
  result: Record<string, unknown>,
  includeDrumMap: boolean,
  chainsForDrumMap: boolean,
  notation?: Notation,
): Record<string, unknown> {
  if (includeDrumMap) {
    const drumMap = getDrumMap(
      [result as unknown as DeviceWithDrumPads],
      notation,
    );

    if (drumMap != null) {
      result.drumMap = drumMap;
    }
  }

  // Strip chains that were only fetched internally for drum map building
  if (chainsForDrumMap) {
    delete result.chains;
    delete result.drumPads;
    delete result.hasSoloedChain;
  }

  return result;
}

/**
 * Read device by ID
 * @param deviceId - Device ID to read
 * @param options - Read options
 * @returns Device information
 */
function readDeviceById(
  deviceId: string,
  options: ReadOptions,
): Record<string, unknown> {
  const device = LiveAPI.from(`id ${deviceId}`);

  if (!device.exists()) {
    throw new Error(`Device with ID ${deviceId} not found`);
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

/**
 * Read drum pad by path
 * @param liveApiPath - Live API path to parent device
 * @param drumPadNote - Note name of the drum pad (e.g., "C1")
 * @param remainingSegments - Segments after drum pad in path
 * @param fullPath - Full simplified path for response
 * @param options - Read options
 * @returns Drum pad, chain, or device information
 */
function readDrumPadByPath(
  liveApiPath: string,
  drumPadNote: string,
  remainingSegments: string[],
  fullPath: string,
  options: ReadOptions,
): Record<string, unknown> {
  const device = LiveAPI.from(liveApiPath);

  if (!device.exists()) {
    throw new Error(`Device not found at path: ${liveApiPath}`);
  }

  // Get drum pads and find the one matching the note. The grammar already
  // validated the note, so the only one that doesn't convert is the catch-all
  // "p*" — and Live has no drum_pads entry for it, so it reports as not found.
  const drumPads = device.getChildren("drum_pads");
  const targetMidiNote = noteNameToMidi(drumPadNote);
  const pad = drumPads.find((p) => p.getProperty("note") === targetMidiNote);

  if (!pad) {
    throw new Error(`Drum pad ${drumPadNote} not found`);
  }

  // If there are remaining segments, navigate into chains
  if (remainingSegments.length > 0) {
    return readDrumPadNestedTarget(pad, remainingSegments, fullPath, options);
  }

  // Return drum pad info
  return buildDrumPadInfo(pad, fullPath, options);
}

/**
 * Navigate into drum pad chains based on remaining path segments. The chain
 * segment is optional: a leading `c<N>` selects a chain, while a leading `d<N>`
 * implies chain 0 (so `pC1/d0` == `pC1/c0/d0`). This mirrors the write-side
 * pad-property shortcut (see resolveNestedParamTarget) so reads and writes
 * accept the same drum-pad paths.
 * @param pad - Drum pad Live API object
 * @param remainingSegments - Segments after drum pad in path
 * @param fullPath - Full simplified path for response
 * @param options - Read options
 * @returns Chain or device information
 */
function readDrumPadNestedTarget(
  pad: LiveAPI,
  remainingSegments: string[],
  fullPath: string,
  options: ReadOptions,
): Record<string, unknown> {
  const chains = pad.getChildren("chains");
  const firstSegment = assertDefined(
    remainingSegments[0],
    "chain or device segment",
  );
  // A leading "c<N>" is an explicit chain index; otherwise chain 0 is implied
  // and the first segment is the device.
  const hasChainSegment = firstSegment.startsWith("c");
  const chainIndex = hasChainSegment
    ? Number.parseInt(firstSegment.slice(1))
    : 0;

  if (
    Number.isNaN(chainIndex) ||
    chainIndex < 0 ||
    chainIndex >= chains.length
  ) {
    throw new Error(`Invalid chain index in path: ${fullPath}`);
  }

  const chain = assertDefined(
    chains[chainIndex],
    `chain at index ${chainIndex}`,
  );

  // The device segment follows the optional chain segment. With no device
  // segment (explicit chain only, e.g. "pC1/c0"), return the chain.
  const deviceSegment = hasChainSegment
    ? remainingSegments[1]
    : remainingSegments[0];

  if (deviceSegment == null) {
    return readDrumPadChain(chain, fullPath, options);
  }

  // Parse device index from prefixed segment (e.g., "d0" -> 0)
  const deviceIndex = Number.parseInt(deviceSegment.slice(1));
  const devices = chain.getChildren("devices");

  if (
    Number.isNaN(deviceIndex) ||
    deviceIndex < 0 ||
    deviceIndex >= devices.length
  ) {
    throw new Error(`Invalid device index in path: ${fullPath}`);
  }

  const device = assertDefined(
    devices[deviceIndex],
    `device at index ${deviceIndex}`,
  );

  // Anything after the device segment points inside it — a nested rack's own
  // pads, chains, or devices. Without this the extra segments were dropped and
  // the outer device came back under the requested path, so a read of a nested
  // pad silently answered with the rack holding it.
  const nested = remainingSegments.slice(hasChainSegment ? 2 : 1);

  if (nested.length > 0) {
    return readNestedTarget(device, nested, fullPath, options);
  }

  return readDeviceShared(device, {
    ...options,
    parentPath: fullPath,
  });
}

/**
 * Read a target further inside a device reached through a drum pad path.
 * Navigation is shared with the write side so both accept the same paths.
 * @param device - Device the remaining segments are relative to
 * @param segments - Segments after the device (c/rc/d/p prefixed)
 * @param fullPath - Full simplified path for the response
 * @param options - Read options
 * @returns Chain or device information
 */
function readNestedTarget(
  device: LiveAPI,
  segments: string[],
  fullPath: string,
  options: ReadOptions,
): Record<string, unknown> {
  const { target, targetType } = navigateRemainingSegments(device, segments);

  if (target == null) {
    throw new Error(`Invalid path: ${fullPath}`);
  }

  if (targetType === "chain") {
    return readDrumPadChain(target, fullPath, options);
  }

  return readDeviceShared(target, { ...options, parentPath: fullPath });
}

/**
 * Read chain within a drum pad
 * @param chain - Chain Live API object
 * @param path - Simplified path for response
 * @param options - Read options
 * @returns Chain information
 */
function readDrumPadChain(
  chain: LiveAPI,
  path: string,
  options: ReadOptions,
): Record<string, unknown> {
  const devices = chain
    .getChildren("devices")
    .map((device: LiveAPI, index: number) => {
      const devicePath = `${path}/d${index}`;

      return readDeviceShared(device, {
        ...options,
        parentPath: devicePath,
      });
    });

  return buildChainInfo(chain, { path, devices });
}

/**
 * Build drum pad info object
 * @param pad - Drum pad Live API object
 * @param path - Simplified path for response
 * @param options - Read options
 * @returns Drum pad information
 */
function buildDrumPadInfo(
  pad: LiveAPI,
  path: string,
  options: ReadOptions,
): Record<string, unknown> {
  const midiNote = pad.getProperty("note") as number;
  // readDrumPadByPath matched this pad by the MIDI note parsed from the pad path,
  // so the note is always in range and always names.
  const noteName = midiToNoteName(midiNote) as string;
  const isMuted = (pad.getProperty("mute") as number) > 0;
  const isSoloed = (pad.getProperty("solo") as number) > 0;

  const drumPadInfo: Record<string, unknown> = {
    id: pad.id,
    path,
    name: pad.getProperty("name"),
    note: midiNote,
    pitch: noteName,
  };

  if (isSoloed) {
    drumPadInfo.state = STATE.SOLOED;
  } else if (isMuted) {
    drumPadInfo.state = STATE.MUTED;
  }

  // Include chains if requested
  if (options.includeChains || options.includeDrumPads) {
    const chains = pad.getChildren("chains");

    drumPadInfo.chains = chains.map((chain: LiveAPI, chainIndex: number) => {
      const chainPath = `${path}/c${chainIndex}`;
      const devices = chain
        .getChildren("devices")
        .map((device: LiveAPI, deviceIndex: number) => {
          const devicePath = `${chainPath}/d${deviceIndex}`;

          return readDeviceShared(device, {
            ...options,
            parentPath: devicePath,
          });
        });

      return buildChainInfo(chain, {
        path: chainPath,
        devices,
      });
    });
  }

  return drumPadInfo;
}
