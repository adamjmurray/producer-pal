// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { midiToNoteName } from "#src/shared/pitch.ts";
import { STATE } from "#src/tools/constants.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";
import {
  buildChainInfo,
  hasInstrumentInDevices,
  type DeviceInfo,
} from "./device-state-helpers.ts";
import { extractDevicePath } from "./path/device-path-helpers.ts";

export interface DrumChainOptions {
  includeDrumPads: boolean;
  includeChains: boolean;
  depth: number;
  maxDepth: number;
  readDeviceFn: (
    device: LiveAPI,
    options: Record<string, unknown>,
  ) => Record<string, unknown>;
  parentPath: string | null;
}

export interface ProcessedChain {
  name?: string;
  state?: string;
  _hasInstrument?: boolean;
  _inNote?: number;
}

export interface DrumPadInfo {
  note: number;
  pitch: string | null;
  name?: string;
  state?: string;
  hasInstrument?: boolean;
  chains?: Record<string, unknown>[];
  _processedChains?: ProcessedChain[];
}

/**
 * Build path for a drum rack chain based on its in_note and position within that note group
 * @param parentPath - Parent device path (e.g., "0/0")
 * @param inNote - Chain's in_note property (-1 for catch-all, >=0 for specific note)
 * @param indexWithinNote - Index within chains having the same in_note
 * @returns Chain path (e.g., "0/0/pC1/0" or "0/0/p[star]/0" for catch-all)
 */
function buildDrumChainPath(
  parentPath: string,
  inNote: number,
  indexWithinNote: number,
): string {
  if (inNote === -1) {
    // Catch-all chain: p*/0, p*/1, etc.
    return `${parentPath}/p*/${indexWithinNote}`;
  }

  const noteName = midiToNoteName(inNote);

  if (noteName == null) {
    // Invalid note - use catch-all notation with index
    return `${parentPath}/p*/${indexWithinNote}`;
  }

  // Note-specific chain: pC1/0, pC1/1, etc.
  return `${parentPath}/p${noteName}/${indexWithinNote}`;
}

/**
 * Process a single drum rack chain
 * @param chain - Chain object from drum rack
 * @param inNote - Chain's in_note property
 * @param indexWithinNote - Index within chains having the same in_note
 * @param options - Processing options
 * @returns Processed chain info
 */
function processDrumRackChain(
  chain: LiveAPI,
  inNote: number,
  indexWithinNote: number,
  options: DrumChainOptions,
): Record<string, unknown> {
  const {
    includeDrumPads,
    includeChains,
    depth,
    maxDepth,
    readDeviceFn,
    parentPath,
  } = options;

  const chainPath = parentPath
    ? buildDrumChainPath(parentPath, inNote, indexWithinNote)
    : null;

  const chainDevices = chain.getChildren("devices");
  const processedDevices = chainDevices.map((chainDevice, deviceIndex) => {
    const devicePath = chainPath ? `${chainPath}/${deviceIndex}` : null;

    return readDeviceFn(chainDevice, {
      includeChains: includeDrumPads && includeChains,
      includeDrumPads: includeDrumPads && includeChains,
      depth: depth + 1,
      maxDepth,
      parentPath: devicePath,
    });
  });

  const chainInfo = buildChainInfo(chain, {
    path: chainPath,
    devices: processedDevices,
  });

  // Add in_note for internal tracking
  chainInfo._inNote = inNote;
  chainInfo._hasInstrument = hasInstrumentInDevices(
    processedDevices as unknown as DeviceInfo[],
  );

  return chainInfo;
}

/**
 * Group chains by their in_note property
 * @param chains - Array of chain objects
 * @returns Map of in_note -> array of chains with indices
 */
function groupChainsByNote(chains: LiveAPI[]): Map<number, LiveAPI[]> {
  const noteGroups = new Map<number, LiveAPI[]>();

  for (const chain of chains) {
    const inNote = chain.getProperty("in_note") as number;
    const group = noteGroups.get(inNote);

    if (group) {
      group.push(chain);
    } else {
      noteGroups.set(inNote, [chain]);
    }
  }

  return noteGroups;
}

/**
 * Build drum pad info from grouped chains
 * @param inNote - MIDI note or -1 for catch-all
 * @param processedChains - Processed chain info objects
 * @returns Drum pad info object
 */
function buildDrumPadFromChains(
  inNote: number,
  processedChains: ProcessedChain[],
): Record<string, unknown> {
  const firstChain = assertDefined(processedChains[0], "first chain");
  const isCatchAll = inNote === -1;

  const drumPadInfo: Record<string, unknown> = {
    note: inNote,
    pitch: isCatchAll ? "*" : midiToNoteName(inNote),
    name: firstChain.name,
  };

  // Aggregate state from chains
  const states = new Set(
    processedChains.map((c) => c.state).filter((s) => s !== undefined),
  );

  if (states.has(STATE.SOLOED)) {
    drumPadInfo.state = STATE.SOLOED;
  } else if (states.has(STATE.MUTED)) {
    drumPadInfo.state = STATE.MUTED;
  }

  // Check if any chain has instrument
  const anyHasInstrument = processedChains.some((c) => c._hasInstrument);

  if (!anyHasInstrument) {
    drumPadInfo.hasInstrument = false;
  }

  return drumPadInfo;
}

/**
 * Update drum pad solo states based on which pads are soloed
 * @param processedDrumPads - Drum pads to update
 */
export function updateDrumPadSoloStates(
  processedDrumPads: DrumPadInfo[],
): void {
  const hasSoloedDrumPad = processedDrumPads.some(
    (drumPadInfo) => drumPadInfo.state === STATE.SOLOED,
  );

  if (!hasSoloedDrumPad) {
    return;
  }

  for (const drumPadInfo of processedDrumPads) {
    if (drumPadInfo.state === STATE.SOLOED) {
      // Keep soloed state as-is
    } else if (drumPadInfo.state === STATE.MUTED) {
      drumPadInfo.state = STATE.MUTED_ALSO_VIA_SOLO;
    } else {
      drumPadInfo.state ??= STATE.MUTED_VIA_SOLO;
    }
  }
}

/**
 * Process drum rack chains to build drum pads output
 * Uses chains with in_note property instead of drum_pads collection.
 * This correctly handles nested drum racks by following the actual device hierarchy.
 *
 * @param device - Device object
 * @param deviceInfo - Device info to update
 * @param includeChains - Include chains data in drum pads
 * @param includeDrumPads - Include drum pads in output
 * @param depth - Current depth
 * @param maxDepth - Max depth
 * @param readDeviceFn - readDevice function
 */
export function processDrumPads(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  includeChains: boolean,
  includeDrumPads: boolean,
  depth: number,
  maxDepth: number,
  readDeviceFn: DrumChainOptions["readDeviceFn"],
): void {
  const chains = device.getChildren("chains");
  const parentPath = extractDevicePath(device.path);

  // Group chains by in_note
  const noteGroups = groupChainsByNote(chains);

  // Process each group
  const processedDrumPads: Record<string, unknown>[] = [];

  for (const [inNote, chainsForNote] of noteGroups) {
    // Process each chain in the group
    const processedChains = chainsForNote.map((chain, indexWithinNote) =>
      processDrumRackChain(chain, inNote, indexWithinNote, {
        includeDrumPads,
        includeChains,
        depth,
        maxDepth,
        readDeviceFn,
        parentPath,
      }),
    );

    // Build drum pad info from the chains
    const drumPadInfo = buildDrumPadFromChains(
      inNote,
      processedChains as ProcessedChain[],
    );

    // Add chains if requested
    if (includeDrumPads && includeChains) {
      // Clean up internal properties before adding to output
      drumPadInfo.chains = processedChains.map(
        ({ _inNote, _hasInstrument, ...chainInfo }) => chainInfo,
      );
    }

    // Store for internal use (drum map building)
    drumPadInfo._processedChains = processedChains;

    processedDrumPads.push(drumPadInfo);
  }

  // Sort drum pads: note-specific first (sorted by note), then catch-all
  processedDrumPads.sort((a, b) => {
    const aNote = a.note as number;
    const bNote = b.note as number;

    if (aNote === -1 && bNote === -1) return 0;
    if (aNote === -1) return 1; // catch-all at end
    if (bNote === -1) return -1;

    return aNote - bNote;
  });

  updateDrumPadSoloStates(processedDrumPads as unknown as DrumPadInfo[]);

  if (includeDrumPads) {
    deviceInfo.drumPads = processedDrumPads.map(
      ({ _processedChains, ...drumPadInfo }) => drumPadInfo,
    );
  }

  // Store for drum map building (with internal properties intact)
  deviceInfo._processedDrumPads = processedDrumPads;
}
