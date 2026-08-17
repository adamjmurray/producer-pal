// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Helpers for auto-creating chains when resolving container paths
 */

import { assertDefined } from "#src/shared/error-utils.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import { trackSegmentPath } from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  liveApiCollection,
  type IndexedSegment,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";
import { resolveDrumPadFromPath } from "./path/device-drumpad-navigation.ts";

/** A chain segment: everything an IndexedSegment can be except a device. */
type ChainSegment = Exclude<IndexedSegment, { kind: "device" }>;

// Maximum chains that can be auto-created to prevent runaway creation
const MAX_AUTO_CREATE_CHAINS = 16;

/**
 * Resolve container with auto-creation of missing chains
 * @param root - Parsed track root
 * @param segments - Device and chain segments below the root
 * @param path - Original path for error messages
 * @returns LiveAPI object (Track or Chain)
 */
export function resolveContainerWithAutoCreate(
  root: TrackSegment,
  segments: IndexedSegment[],
  path: string,
): LiveAPI {
  let currentPath = trackSegmentPath(root).toString();
  let current = LiveAPI.from(currentPath);

  if (!current.exists()) {
    throw new Error(`Track in path "${path}" does not exist`);
  }

  for (const segment of segments) {
    if (segment.kind === "device") {
      current = navigateToDevice(currentPath, segment.index, path);
      currentPath += ` devices ${segment.index}`;
    } else {
      current = navigateToChain(current, currentPath, segment, path);
      currentPath = current.path;
    }
  }

  return current;
}

/**
 * Navigate to a device, throwing if it doesn't exist
 * @param currentPath - Current Live API path
 * @param index - Device index
 * @param fullPath - Full path for error messages
 * @returns LiveAPI device object
 */
function navigateToDevice(
  currentPath: string,
  index: number,
  fullPath: string,
): LiveAPI {
  const devicePath = `${currentPath} devices ${index}`;
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
 * @param segment - Chain or return-chain segment
 * @param fullPath - Full path for error messages
 * @returns LiveAPI chain object
 */
function navigateToChain(
  parentDevice: LiveAPI,
  currentPath: string,
  segment: ChainSegment,
  fullPath: string,
): LiveAPI {
  const chainPath = `${currentPath} ${liveApiCollection(segment)} ${segment.index}`;

  // Return chains are never auto-created
  if (segment.kind === "return-chain") {
    const chain = LiveAPI.from(chainPath);

    if (!chain.exists()) {
      throw new Error(`Return chain in path "${fullPath}" does not exist`);
    }

    return chain;
  }

  if (segment.index >= parentDevice.getChildren("chains").length) {
    autoCreateChains(parentDevice, segment.index, fullPath);
  }

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
