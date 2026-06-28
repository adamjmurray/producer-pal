// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Helpers for auto-creating chains when resolving container paths
 */

import { assertDefined } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import { resolveDrumPadFromPath } from "./path/device-drumpad-navigation.ts";

// Maximum chains that can be auto-created to prevent runaway creation
const MAX_AUTO_CREATE_CHAINS = 16;

/**
 * Resolve container with auto-creation of missing chains
 * @param segments - Path segments with explicit prefixes (t, rt, mt, d, c, rc)
 * @param path - Original path for error messages
 * @returns LiveAPI object (Track or Chain)
 */
export function resolveContainerWithAutoCreate(
  segments: string[],
  path: string,
): LiveAPI {
  // Start with track
  let currentPath = resolveTrackPath(
    assertDefined(segments[0], "track segment"),
  );
  let current = LiveAPI.from(currentPath);

  if (!current.exists()) {
    throw new Error(`Track in path "${path}" does not exist`);
  }

  // Process remaining segments using explicit prefixes
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i] as string;

    if (segment.startsWith("d")) {
      // Device segment
      const deviceIndex = segment.slice(1);

      current = navigateToDevice(currentPath, deviceIndex, path);
      currentPath += ` devices ${deviceIndex}`;
    } else if (segment.startsWith("c") || segment.startsWith("rc")) {
      // Chain segment (c for regular, rc for return chain)
      current = navigateToChain(current, currentPath, segment, path);
      currentPath = current.path;
    }
  }

  return current;
}

/**
 * Get Live API path for track segment
 * @param segment - Track segment ("t0", "rt0", "mt")
 * @returns Live API path
 */
function resolveTrackPath(segment: string): string {
  if (segment === "mt") {
    return livePath.masterTrack().toString();
  }

  if (segment.startsWith("rt")) {
    return livePath.returnTrack(Number.parseInt(segment.slice(2))).toString();
  }

  if (segment.startsWith("t")) {
    return livePath.track(Number.parseInt(segment.slice(1))).toString();
  }

  throw new Error(`Invalid track segment: ${segment}`);
}

/**
 * Navigate to a device, throwing if it doesn't exist
 * @param currentPath - Current Live API path
 * @param segment - Device index segment
 * @param fullPath - Full path for error messages
 * @returns LiveAPI device object
 */
function navigateToDevice(
  currentPath: string,
  segment: string,
  fullPath: string,
): LiveAPI {
  const devicePath = `${currentPath} devices ${segment}`;
  const device = LiveAPI.from(devicePath);

  if (!device.exists()) {
    throw new Error(`Device in path "${fullPath}" does not exist`);
  }

  return device;
}

/**
 * Navigate to a chain, auto-creating if necessary
 * @param parentDevice - Parent device LiveAPI object
 * @param currentPath - Current Live API path
 * @param segment - Chain segment ("cN" for chain, "rcN" for return chain)
 * @param fullPath - Full path for error messages
 * @returns LiveAPI chain object
 */
function navigateToChain(
  parentDevice: LiveAPI,
  currentPath: string,
  segment: string,
  fullPath: string,
): LiveAPI {
  // Return chain (rc prefix) - no auto-creation
  if (segment.startsWith("rc")) {
    const returnIndex = Number.parseInt(segment.slice(2));
    const chainPath = `${currentPath} return_chains ${returnIndex}`;
    const chain = LiveAPI.from(chainPath);

    if (!chain.exists()) {
      throw new Error(`Return chain in path "${fullPath}" does not exist`);
    }

    return chain;
  }

  // Regular chain (c prefix) - may need auto-creation
  const chainIndex = Number.parseInt(segment.slice(1));
  const chains = parentDevice.getChildren("chains");

  if (chainIndex >= chains.length) {
    autoCreateChains(parentDevice, chainIndex, fullPath);
  }

  const chainPath = `${currentPath} chains ${chainIndex}`;

  return LiveAPI.from(chainPath);
}

/**
 * Auto-create chains up to the requested index
 * @param device - Parent device LiveAPI object
 * @param targetIndex - Target chain index
 * @param fullPath - Full path for error messages
 */
function autoCreateChains(
  device: LiveAPI,
  targetIndex: number,
  fullPath: string,
): void {
  // Check if device supports chains (prevents infinite loop on non-rack devices)
  if (!device.getProperty("can_have_chains")) {
    throw new Error(`Device at path "${fullPath}" does not support chains`);
  }

  // Check if it's a Drum Rack
  if ((device.getProperty("can_have_drum_pads") as number) > 0) {
    throw new Error(
      `Auto-creating chains in Drum Racks is not supported (path: "${fullPath}")`,
    );
  }

  // Limit how many chains can be auto-created
  const chainsToCreate = targetIndex + 1 - device.getChildren("chains").length;

  if (chainsToCreate > MAX_AUTO_CREATE_CHAINS) {
    throw new Error(
      `Cannot auto-create ${chainsToCreate} chains (max: ${MAX_AUTO_CREATE_CHAINS}) in path "${fullPath}"`,
    );
  }

  // Create the exact number of chains needed (bounded loop, not while)
  for (let i = 0; i < chainsToCreate; i++) {
    const result = device.call("insert_chain");

    // insert_chain returns ["id", chainId] on success, or 1 on failure
    if (!Array.isArray(result) || result[0] !== "id") {
      throw new Error(
        `Failed to create chain ${i + 1}/${chainsToCreate} in path "${fullPath}"`,
      );
    }
  }
}

/**
 * Auto-create drum pad chains up to the requested index within a note group.
 * Creates chains with the specified in_note value (MIDI note number).
 * @param device - Drum rack device LiveAPI object
 * @param targetInNote - MIDI note for the chain's in_note property
 * @param targetIndex - Target chain index within the note group
 * @param existingCount - Current count of chains with this in_note
 */
export function autoCreateDrumPadChains(
  device: LiveAPI,
  targetInNote: number,
  targetIndex: number,
  existingCount: number,
): void {
  const chainsToCreate = targetIndex + 1 - existingCount;

  if (chainsToCreate > MAX_AUTO_CREATE_CHAINS) {
    throw new Error(
      `Cannot auto-create ${chainsToCreate} drum pad chains (max: ${MAX_AUTO_CREATE_CHAINS})`,
    );
  }

  for (let i = 0; i < chainsToCreate; i++) {
    // Create chain (appends to end with in_note = -1 "All Notes")
    device.call("insert_chain");

    // Get the new chain (it's at the end)
    const chains = device.getChildren("chains");
    const newChain = chains.at(-1);

    // Set in_note to assign it to the correct pad
    if (newChain) {
      newChain.set("in_note", targetInNote);
    }
  }
}

/**
 * Resolve a drum pad chain relative to a rack, auto-creating it (and any
 * lower-indexed sibling chains in the same note group) when missing. The
 * read-only navigator (`resolveDrumPadFromPath`) never creates chains; this is
 * the shared write-path entry used by device insertion and the path-prefixed
 * sample pseudo-param.
 * @param rack - Drum Rack device LiveAPI object
 * @param drumPadNote - Note name (e.g. "C1", "F#1") or "*" for the catch-all pad
 * @param chainSegments - Path segments after the pad note ([] or ["c<n>"])
 * @returns The resolved chain, or null when it can't be resolved/created
 */
export function resolveOrCreateDrumPadChain(
  rack: LiveAPI,
  drumPadNote: string,
  chainSegments: string[],
): LiveAPI | null {
  if (!rack.exists()) {
    return null;
  }

  // Only a Drum Rack has drum pads. A plain chain-capable Rack (can_have_chains
  // true, can_have_drum_pads false) would let insert_chain below succeed and
  // strand an empty chain in the wrong rack; refuse it here so a `pC1/…/sample`
  // aimed at a non-drum rack warn-skips with state untouched (the inverse of
  // autoCreateChains, which refuses Drum Racks on the regular-chain path).
  if ((rack.getProperty("can_have_drum_pads") as number) <= 0) {
    return null;
  }

  const existing = resolveDrumPadFromPath(
    rack.path,
    drumPadNote,
    chainSegments,
  );

  if (existing.target) {
    return existing.target;
  }

  // Only a missing chain is auto-creatable (a missing device is a real miss).
  if (existing.targetType !== "chain") {
    return null;
  }

  const targetInNote = drumPadNote === "*" ? -1 : noteNameToMidi(drumPadNote);

  if (targetInNote == null) {
    return null;
  }

  const chainIndex = parseDrumPadChainIndex(chainSegments);

  if (chainIndex == null) {
    return null;
  }

  const matchingChains = rack
    .getChildren("chains")
    .filter((chain) => chain.getProperty("in_note") === targetInNote);

  if (chainIndex >= matchingChains.length) {
    autoCreateDrumPadChains(
      rack,
      targetInNote,
      chainIndex,
      matchingChains.length,
    );
  }

  return resolveDrumPadFromPath(rack.path, drumPadNote, chainSegments).target;
}

/**
 * Parse the chain index from a drum pad's remaining path segments. A leading
 * `c`-prefixed segment selects the chain within the note group; otherwise it
 * defaults to 0.
 * @param chainSegments - Path segments after the pad note
 * @returns The chain index (>= 0), or null when malformed
 */
function parseDrumPadChainIndex(chainSegments: string[]): number | null {
  if (chainSegments.length === 0) {
    return 0;
  }

  const segment = assertDefined(chainSegments[0], "chain segment");
  const index = segment.startsWith("c")
    ? Number.parseInt(segment.slice(1))
    : Number.parseInt(segment);

  return Number.isNaN(index) || index < 0 ? null : index;
}
