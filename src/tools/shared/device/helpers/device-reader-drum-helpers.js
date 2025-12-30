import { midiToNoteName } from "#src/shared/pitch.js";
import { STATE } from "#src/tools/constants.js";
import { extractDevicePath } from "./device-path-helpers.js";
import {
  buildChainInfo,
  hasInstrumentInDevices,
} from "./device-state-helpers.js";

/**
 * Build path for a drum rack chain based on its in_note and position within that note group
 * @param {string} parentPath - Parent device path (e.g., "0/0")
 * @param {number} inNote - Chain's in_note property (-1 for catch-all, >=0 for specific note)
 * @param {number} indexWithinNote - Index within chains having the same in_note
 * @returns {string} Chain path (e.g., "0/0/pC1/0" or "0/0/p[star]/0" for catch-all)
 */
function buildDrumChainPath(parentPath, inNote, indexWithinNote) {
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
 * @param {object} chain - Chain object from drum rack
 * @param {number} inNote - Chain's in_note property
 * @param {number} indexWithinNote - Index within chains having the same in_note
 * @param {object} options - Processing options
 * @returns {object} Processed chain info
 */
function processDrumRackChain(chain, inNote, indexWithinNote, options) {
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
  chainInfo._hasInstrument = hasInstrumentInDevices(processedDevices);

  return chainInfo;
}

/**
 * Group chains by their in_note property
 * @param {Array} chains - Array of chain objects
 * @returns {Map} Map of in_note -> array of chains with indices
 */
function groupChainsByNote(chains) {
  const noteGroups = new Map();

  chains.forEach((chain) => {
    const inNote = chain.getProperty("in_note");

    if (!noteGroups.has(inNote)) {
      noteGroups.set(inNote, []);
    }

    noteGroups.get(inNote).push(chain);
  });

  return noteGroups;
}

/**
 * Build drum pad info from grouped chains
 * @param {number} inNote - MIDI note or -1 for catch-all
 * @param {Array} processedChains - Processed chain info objects
 * @returns {object} Drum pad info object
 */
function buildDrumPadFromChains(inNote, processedChains) {
  const firstChain = processedChains[0];
  const isCatchAll = inNote === -1;

  const drumPadInfo = {
    note: inNote,
    pitch: isCatchAll ? "*" : midiToNoteName(inNote),
    name: firstChain.name,
  };

  // Aggregate state from chains
  const states = processedChains
    .map((c) => c.state)
    .filter((s) => s !== undefined);

  if (states.includes(STATE.SOLOED)) {
    drumPadInfo.state = STATE.SOLOED;
  } else if (states.includes(STATE.MUTED)) {
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
 * @param {Array} processedDrumPads - Drum pads to update
 */
export function updateDrumPadSoloStates(processedDrumPads) {
  const hasSoloedDrumPad = processedDrumPads.some(
    (drumPadInfo) => drumPadInfo.state === STATE.SOLOED,
  );

  if (!hasSoloedDrumPad) {
    return;
  }

  processedDrumPads.forEach((drumPadInfo) => {
    if (drumPadInfo.state === STATE.SOLOED) {
      // Keep soloed state as-is
    } else if (drumPadInfo.state === STATE.MUTED) {
      drumPadInfo.state = STATE.MUTED_ALSO_VIA_SOLO;
    } else if (!drumPadInfo.state) {
      drumPadInfo.state = STATE.MUTED_VIA_SOLO;
    }
  });
}

/**
 * Process drum rack chains to build drum pads output
 * Uses chains with in_note property instead of drum_pads collection.
 * This correctly handles nested drum racks by following the actual device hierarchy.
 *
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {boolean} includeChains - Include chains data in drum pads
 * @param {boolean} includeDrumPads - Include drum pads in output
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function
 */
export function processDrumPads(
  device,
  deviceInfo,
  includeChains,
  includeDrumPads,
  depth,
  maxDepth,
  readDeviceFn,
) {
  const chains = device.getChildren("chains");
  const parentPath = extractDevicePath(device.path);

  // Group chains by in_note
  const noteGroups = groupChainsByNote(chains);

  // Process each group
  const processedDrumPads = [];

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
    const drumPadInfo = buildDrumPadFromChains(inNote, processedChains);

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
    if (a.note === -1 && b.note === -1) return 0;
    if (a.note === -1) return 1; // catch-all at end
    if (b.note === -1) return -1;

    return a.note - b.note;
  });

  updateDrumPadSoloStates(processedDrumPads);

  if (includeDrumPads) {
    deviceInfo.drumPads = processedDrumPads.map(
      ({ _processedChains, ...drumPadInfo }) => drumPadInfo,
    );
  }

  // Store for drum map building (with internal properties intact)
  deviceInfo._processedDrumPads = processedDrumPads;
}
