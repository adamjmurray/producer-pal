// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface DrumChainConfig {
  devicePath: string;
  chainPath: string;
  drumRackId: string;
  chainId: string;
  inNote?: number;
  extraPadPath?: Record<string, string> | null;
}

interface DeviceMockResult {
  devices: Map<string, MockObjectHandle>;
  parents: Map<string, MockObjectHandle>;
}

/**
 * Extract parent path from a device path (everything before last "devices N").
 * @param devicePath - Full device path
 * @returns Parent path or null
 */
function extractDeviceParentPath(devicePath: string): string | null {
  const matches = [...devicePath.matchAll(/devices \d+/g)];

  if (matches.length === 0) return null;

  // We know matches is non-empty from the check above
  const lastMatch = matches.at(-1) as RegExpExecArray;

  return devicePath.substring(0, lastMatch.index).trim() || null;
}

/**
 * Generic setup for entity mocks using the mock registry.
 * @param idToPathMap - Mapping of IDs to their paths
 * @param entityType - Live API type to return (e.g., "Track", "Scene")
 * @returns Map of ID to mock object handle
 */
export function setupEntityMocks(
  idToPathMap: Record<string, string>,
  entityType: string,
): Map<string, MockObjectHandle> {
  const handles = new Map<string, MockObjectHandle>();

  for (const [id, path] of Object.entries(idToPathMap)) {
    handles.set(id, registerMockObject(id, { path, type: entityType }));
  }

  return handles;
}

/**
 * Setup mocks for track-related tests.
 * @param idToPathMap - Mapping of track IDs to their paths
 * @returns Map of track ID to mock object handle
 */
export function setupTrackMocks(
  idToPathMap: Record<string, string>,
): Map<string, MockObjectHandle> {
  return setupEntityMocks(idToPathMap, "Track");
}

/**
 * Setup mocks for scene-related tests.
 * @param idToPathMap - Mapping of scene IDs to their paths
 * @returns Map of scene ID to mock object handle
 */
export function setupSceneMocks(
  idToPathMap: Record<string, string>,
): Map<string, MockObjectHandle> {
  return setupEntityMocks(idToPathMap, "Scene");
}

/**
 * Setup mocks for device deletion tests using the mock registry.
 * Registers devices and their parent objects (for delete_device calls).
 * @param deviceIds - Device ID(s) to mock
 * @param pathOrMap - Path string for single device, or ID-to-path mapping
 * @param type - Live API type to return
 * @returns Device and parent handles
 */
export function setupDeviceMocks(
  deviceIds: string | string[],
  pathOrMap: string | Record<string, string>,
  type: string = "Device",
): DeviceMockResult {
  const ids = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
  // ids always has at least one element since deviceIds is string | string[]
  const pathMap: Record<string, string> =
    typeof pathOrMap === "string"
      ? { [ids[0] as string]: pathOrMap }
      : pathOrMap;

  const devices = new Map<string, MockObjectHandle>();
  const parents = new Map<string, MockObjectHandle>();

  for (const [id, path] of Object.entries(pathMap)) {
    devices.set(id, registerMockObject(id, { path, type }));

    // Auto-register parent for delete_device calls
    const parentPath = extractDeviceParentPath(path);

    if (parentPath && !parents.has(parentPath)) {
      const parentId = parentPath.replaceAll(/\s+/g, "/");

      parents.set(
        parentPath,
        registerMockObject(parentId, { path: parentPath }),
      );
    }
  }

  return { devices, parents };
}

/**
 * Setup mocks for drum pad deletion tests.
 * @param padIds - Drum pad ID(s) to mock
 * @param pathOrMap - Path string for single pad, or ID-to-path mapping
 * @returns Device and parent handles
 */
export function setupDrumPadMocks(
  padIds: string | string[],
  pathOrMap: string | Record<string, string>,
): DeviceMockResult {
  return setupDeviceMocks(padIds, pathOrMap, "DrumPad");
}

/**
 * Setup mocks for drum chain deletion tests (path-based drum pad deletion).
 * @param config - Configuration object
 * @param config.devicePath - Live API path for the drum rack device
 * @param config.chainPath - Live API path for the drum chain
 * @param config.drumRackId - Mock ID for the drum rack
 * @param config.chainId - Mock ID for the chain
 * @param config.inNote - MIDI note for the drum pad (default 36/C1)
 * @param config.extraPadPath - Optional map of extra pad IDs to paths
 * @returns Drum rack, chain, and extra pad handles
 */
export function setupDrumChainMocks({
  devicePath,
  chainPath,
  drumRackId,
  chainId,
  inNote = 36,
  extraPadPath = null,
}: DrumChainConfig): {
  drumRack: MockObjectHandle;
  chain: MockObjectHandle;
  extraPads: Map<string, MockObjectHandle>;
} {
  const drumRack = registerMockObject(drumRackId, {
    path: devicePath,
    type: "DrumGroupDevice",
    properties: {
      chains: children(chainId),
      can_have_drum_pads: 1,
    },
  });

  const chain = registerMockObject(chainId, {
    path: chainPath,
    type: "DrumChain",
    properties: { in_note: inNote },
  });

  const extraPads = new Map<string, MockObjectHandle>();

  if (extraPadPath) {
    for (const [padId, padPath] of Object.entries(extraPadPath)) {
      extraPads.set(
        padId,
        registerMockObject(padId, { path: padPath, type: "DrumPad" }),
      );
    }
  }

  return { drumRack, chain, extraPads };
}
