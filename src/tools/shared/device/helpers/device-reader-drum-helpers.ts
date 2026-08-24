// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import { midiToNoteName } from "#src/shared/pitch.ts";
import { STATE } from "#src/tools/constants.ts";
import { drumPadIdsByNote } from "./path/device-drumpad-navigation.ts";
import {
  buildChainInfo,
  computeState,
  deviceHasInstrument,
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
  id?: string;
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
 * @param parentPath - Parent device path (e.g., "t0/d0")
 * @param inNote - Chain's in_note property (-1 for catch-all, >=0 for specific note)
 * @param indexWithinNote - Index within chains having the same in_note
 * @returns Chain path (e.g., "t0/d0/pC1/c0" or catch-all form `t0/d0/p*` + `/c0`)
 */
function buildDrumChainPath(
  parentPath: string,
  inNote: number,
  indexWithinNote: number,
): string {
  if (inNote === -1) {
    // Catch-all chain: p*/c0, p*/c1, etc.
    return `${parentPath}/p*/c${indexWithinNote}`;
  }

  const noteName = midiToNoteName(inNote);

  if (noteName == null) {
    // Invalid note - use catch-all notation with index
    return `${parentPath}/p*/c${indexWithinNote}`;
  }

  // Note-specific chain: pC1/c0, pC1/c1, etc.
  return `${parentPath}/p${noteName}/c${indexWithinNote}`;
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
  const { includeDrumPads, includeChains, parentPath } = options;
  const chainPath = parentPath
    ? buildDrumChainPath(parentPath, inNote, indexWithinNote)
    : null;

  // A pad carries its chains only when both were asked for. Otherwise the whole
  // chain info is dropped and only the pad reads it, so build the short form.
  const chainInfo =
    includeDrumPads && includeChains
      ? shownDrumChainInfo(chain, chainPath, options)
      : padOnlyDrumChainInfo(chain);

  // Internal tracking for drum map building
  chainInfo._inNote = inNote;

  return chainInfo;
}

/**
 * A drum chain as the caller will see it, with its own id, path, mixer and
 * either its devices or a count of them.
 * @param chain - Chain object from drum rack
 * @param chainPath - The chain's path in Producer Pal's grammar
 * @param options - Processing options
 * @returns Chain info, with _hasInstrument for the drum map
 */
function shownDrumChainInfo(
  chain: LiveAPI,
  chainPath: string | null,
  options: DrumChainOptions,
): Record<string, unknown> {
  const { includeDrumPads, includeChains, depth, maxDepth, readDeviceFn } =
    options;

  // At the depth limit, count the devices rather than building them.
  if (depth >= maxDepth) {
    const chainInfo = buildChainInfo(chain, {
      path: chainPath,
      deviceCount: chain.getChildCount("devices"),
    });

    chainInfo._hasInstrument = hasInstrumentLazily(chain);

    return chainInfo;
  }

  const chainDevices = chain.getChildren("devices");
  const chainInfo = buildChainInfo(chain, {
    path: chainPath,
    devices: chainDevices.map((chainDevice, deviceIndex) =>
      readDeviceFn(chainDevice, {
        includeChains: includeDrumPads && includeChains,
        includeDrumPads: includeDrumPads && includeChains,
        depth: depth + 1,
        maxDepth,
        parentPath: chainPath ? `${chainPath}/d${deviceIndex}` : null,
      }),
    ),
  });

  chainInfo._hasInstrument = chainDevices.some(deviceHasInstrument);

  return chainInfo;
}

/**
 * The three things a drum pad takes from a chain it won't be showing. The rest
 * of buildChainInfo is pure cost here — the chain mixer alone is a mixer, a
 * volume, a pan and one send per return chain, per pad.
 * @param chain - Chain object from drum rack
 * @returns Chain info holding only what the pad reads
 */
function padOnlyDrumChainInfo(chain: LiveAPI): Record<string, unknown> {
  const state = computeState(chain);

  return {
    name: chain.getProperty("name"),
    ...(state === STATE.ACTIVE ? {} : { state }),
    _hasInstrument: hasInstrumentLazily(chain),
  };
}

/**
 * Whether anything in a chain makes sound. Asked of Live, not of the processed
 * tree, so a chain left unexpanded answers the same as an expanded one —
 * reporting false at the depth limit used to drop every pad of a nested rack
 * from the drum map.
 * @param chain - Chain object from drum rack
 * @returns True when the chain holds an instrument
 */
function hasInstrumentLazily(chain: LiveAPI): boolean {
  // Stops at the first instrument instead of building every device in the pad.
  return chain.someChild("devices", deviceHasInstrument);
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
 * @param padId - The pad's ID, absent when the rack has no pad for this note
 * @returns Drum pad info object
 */
function buildDrumPadFromChains(
  inNote: number,
  processedChains: ProcessedChain[],
  padId: string | undefined,
): Record<string, unknown> {
  const firstChain = assertDefined(processedChains[0], "first chain");
  const isCatchAll = inNote === -1;

  const drumPadInfo: Record<string, unknown> = {
    // No id for the catch-all, or for a Drum Rack nested in a drum pad — that
    // rack has no pads, only chains grouped by in_note. Its absence is how a
    // caller knows the pad can't be named by id.
    ...(padId == null ? {} : { id: padId }),
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
 * @param devicePath - The rack's own path in Producer Pal's grammar
 */
export function processDrumPads(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  includeChains: boolean,
  includeDrumPads: boolean,
  depth: number,
  maxDepth: number,
  readDeviceFn: DrumChainOptions["readDeviceFn"],
  devicePath?: string,
): void {
  const chains = device.getChildren("chains");
  // Prefer the path the caller walked in on: a Live path spells a nested rack's
  // position with raw chain indexes, which loses the pad notation the rest of
  // the tree uses (pF1/c0/d0, not c3/d0).
  const parentPath = devicePath ?? extractDevicePath(device.path);
  // Read the rack's pads once: pads are grouped from chains below, so there is
  // no pad object in hand to take an id from. Only when the pads are being
  // returned — a drum-map walk would build a LiveAPI per pad for an id it
  // never shows.
  const padIdsByNote = includeDrumPads
    ? drumPadIdsByNote(device)
    : new Map<number, string>();

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
      processedChains,
      padIdsByNote.get(inNote),
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
