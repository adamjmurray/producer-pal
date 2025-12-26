import { midiPitchToName } from "#src/notation/midi-pitch-to-name.js";
import { STATE } from "#src/tools/constants.js";
import {
  buildChainPath,
  buildDrumPadPath,
  extractDevicePath,
} from "./device-path-helpers.js";
import {
  computeState,
  hasInstrumentInDevices,
} from "./device-state-helpers.js";

/**
 * Process a single drum pad to extract drum pad info
 * @param {object} pad - Drum pad object
 * @param {Array} chains - Array of chain objects from the pad
 * @param {boolean} includeDrumPads - Include drum pads in output
 * @param {boolean} includeChains - Include chains data in drum pads
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Max depth
 * @param {Function} readDeviceFn - readDevice function (to avoid circular dependency)
 * @param {string|null} parentPath - Parent device path for building drum pad path
 * @returns {object} Processed drum pad info
 */
export function processDrumPad(
  pad,
  chains,
  includeDrumPads,
  includeChains,
  depth,
  maxDepth,
  readDeviceFn,
  parentPath,
) {
  const readDevice = readDeviceFn;
  const midiNote = pad.getProperty("note");
  const noteName = midiPitchToName(midiNote);
  const drumPadPath = parentPath
    ? buildDrumPadPath(parentPath, noteName)
    : null;
  const drumPadInfo = {
    ...(drumPadPath && { path: drumPadPath }),
    name: pad.getProperty("name"),
    note: midiNote,
    pitch: noteName,
    _originalPad: pad,
  };
  const isMuted = pad.getProperty("mute") > 0;
  const isSoloed = pad.getProperty("solo") > 0;

  if (isSoloed) {
    drumPadInfo.state = STATE.SOLOED;
  } else if (isMuted) {
    drumPadInfo.state = STATE.MUTED;
  }

  // Process all chains for hasInstrument check (always needed for drumMap)
  let anyChainHasInstrument = false;
  const processedChains = chains.map((chain, index) => {
    const chainDevices = chain.getChildren("devices");
    const processedDevices = chainDevices.map((chainDevice) =>
      readDevice(chainDevice, {
        includeChains: includeDrumPads && includeChains,
        includeDrumPads: includeDrumPads && includeChains,
        depth: depth + 1,
        maxDepth,
      }),
    );

    if (hasInstrumentInDevices(processedDevices)) {
      anyChainHasInstrument = true;
    }

    const chainPath = drumPadPath ? buildChainPath(drumPadPath, index) : null;
    const chainInfo = {
      id: chain.id,
      ...(chainPath && { path: chainPath }),
      name: chain.getProperty("name"),
    };

    const color = chain.getColor();

    if (color) {
      chainInfo.color = color;
    }

    // DrumChain-specific: choke group
    const chokeGroup = chain.getProperty("choke_group");

    if (chokeGroup > 0) {
      chainInfo.chokeGroup = chokeGroup;
    }

    const chainState = computeState(chain);

    if (chainState !== STATE.ACTIVE) {
      chainInfo.state = chainState;
    }

    chainInfo.devices = processedDevices;

    return chainInfo;
  });

  // Only add chains array when both includeDrumPads and includeChains are true
  if (includeDrumPads && includeChains) {
    drumPadInfo.chains = processedChains;
  }

  if (!anyChainHasInstrument) {
    drumPadInfo.hasInstrument = false;
  }

  return drumPadInfo;
}

/**
 * Update drum pad solo states
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
 * Process drum pads for drum rack devices
 * @param {object} device - Device object
 * @param {object} deviceInfo - Device info to update
 * @param {boolean} includeChains - Include chains in drum pads
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
  const drumPads = device.getChildren("drum_pads");
  const parentPath = extractDevicePath(device.path);
  const processedDrumPads = drumPads
    .filter((pad) => pad.getChildIds("chains").length > 0)
    .map((pad) => {
      const chains = pad.getChildren("chains");

      return processDrumPad(
        pad,
        chains,
        includeDrumPads,
        includeChains,
        depth,
        maxDepth,
        readDeviceFn,
        parentPath,
      );
    });

  updateDrumPadSoloStates(processedDrumPads);

  if (includeDrumPads) {
    deviceInfo.drumPads = processedDrumPads.map(
      ({ _originalPad, ...drumPadInfo }) => drumPadInfo,
    );
  }

  deviceInfo._processedDrumPads = processedDrumPads;
}
