import { midiToNoteName } from "#src/shared/pitch.js";
import { STATE } from "#src/tools/constants.js";
import {
  buildChainInfo,
  hasInstrumentInDevices,
} from "./device-state-helpers.js";
import { extractDevicePath } from "./path/device-path-helpers.js";

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
 * @typedef {object} DrumChainOptions
 * @property {boolean} includeDrumPads
 * @property {boolean} includeChains
 * @property {number} depth
 * @property {number} maxDepth
 * @property {Function} readDeviceFn
 * @property {string | null} parentPath
 */

/**
 * Process a single drum rack chain
 * @param {LiveAPI} chain - Chain object from drum rack
 * @param {number} inNote - Chain's in_note property
 * @param {number} indexWithinNote - Index within chains having the same in_note
 * @param {DrumChainOptions} options - Processing options
 * @returns {Record<string, unknown>} Processed chain info
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
 * @param {LiveAPI[]} chains - Array of chain objects
 * @returns {Map<number, LiveAPI[]>} Map of in_note -> array of chains with indices
 */
function groupChainsByNote(chains) {
  const noteGroups = new Map();

  for (const chain of chains) {
    const inNote = chain.getProperty("in_note");

    if (!noteGroups.has(inNote)) {
      noteGroups.set(inNote, []);
    }

    noteGroups.get(inNote).push(chain);
  }

  return noteGroups;
}

/**
 * @typedef {object} ProcessedChain
 * @property {string} [name] - Chain name
 * @property {string} [state] - Chain state
 * @property {boolean} [_hasInstrument] - Whether chain has instrument
 * @property {number} [_inNote] - Chain's in_note
 */

/**
 * Build drum pad info from grouped chains
 * @param {number} inNote - MIDI note or -1 for catch-all
 * @param {ProcessedChain[]} processedChains - Processed chain info objects
 * @returns {Record<string, unknown>} Drum pad info object
 */
function buildDrumPadFromChains(inNote, processedChains) {
  const firstChain = /** @type {NonNullable<typeof processedChains[0]>} */ (
    processedChains[0]
  );
  const isCatchAll = inNote === -1;

  /** @type {Record<string, unknown>} */
  const drumPadInfo = {
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
 * @typedef {object} DrumPadInfo
 * @property {number} note - MIDI note number
 * @property {string | null} pitch - Pitch name
 * @property {string} [name] - Drum pad name
 * @property {string} [state] - Drum pad state
 * @property {boolean} [hasInstrument] - Whether pad has instrument
 */

/**
 * Update drum pad solo states based on which pads are soloed
 * @param {DrumPadInfo[]} processedDrumPads - Drum pads to update
 */
export function updateDrumPadSoloStates(processedDrumPads) {
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
    } else if (!drumPadInfo.state) {
      drumPadInfo.state = STATE.MUTED_VIA_SOLO;
    }
  }
}

/**
 * Process drum rack chains to build drum pads output
 * Uses chains with in_note property instead of drum_pads collection.
 * This correctly handles nested drum racks by following the actual device hierarchy.
 *
 * @param {LiveAPI} device - Device object
 * @param {Record<string, unknown>} deviceInfo - Device info to update
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
    const aNote = /** @type {number} */ (a.note);
    const bNote = /** @type {number} */ (b.note);

    if (aNote === -1 && bNote === -1) return 0;
    if (aNote === -1) return 1; // catch-all at end
    if (bNote === -1) return -1;

    return aNote - bNote;
  });

  updateDrumPadSoloStates(
    /** @type {DrumPadInfo[]} */ (/** @type {unknown} */ (processedDrumPads)),
  );

  if (includeDrumPads) {
    deviceInfo.drumPads = processedDrumPads.map(
      ({ _processedChains, ...drumPadInfo }) => drumPadInfo,
    );
  }

  // Store for drum map building (with internal properties intact)
  deviceInfo._processedDrumPads = processedDrumPads;
}
