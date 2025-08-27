import * as console from "../../console.js";
import { midiPitchToName } from "../../notation/midi-pitch-to-name.js";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
  STATE,
} from "../constants.js";

/**
 * Compute the state of a Live object (track, drum pad, or chain) based on mute/solo properties
 * @param {Object} liveObject - Live API object with mute, solo, and muted_via_solo properties
 * @returns {string} State: "active" | "muted" | "muted-via-solo" | "muted-also-via-solo" | "soloed"
 */
function computeState(liveObject, trackType = "regular") {
  // Master track doesn't have mute/solo/muted_via_solo properties
  if (trackType === "master") {
    return STATE.ACTIVE;
  }

  const isMuted = liveObject.getProperty("mute") > 0;
  const isSoloed = liveObject.getProperty("solo") > 0;
  const isMutedViaSolo = liveObject.getProperty("muted_via_solo") > 0;

  if (isSoloed) {
    return STATE.SOLOED;
  }

  if (isMuted && isMutedViaSolo) {
    return STATE.MUTED_ALSO_VIA_SOLO;
  }

  if (isMutedViaSolo) {
    return STATE.MUTED_VIA_SOLO;
  }

  if (isMuted) {
    return STATE.MUTED;
  }

  return STATE.ACTIVE;
}

/**
 * Check if device is an instrument type (instrument, instrument rack, or drum rack)
 * @param {string} deviceType - Device type string
 * @returns {boolean} True if device is an instrument type
 */
function isInstrumentDevice(deviceType) {
  return (
    deviceType === DEVICE_TYPE.INSTRUMENT ||
    deviceType === DEVICE_TYPE.INSTRUMENT_RACK ||
    deviceType === DEVICE_TYPE.DRUM_RACK
  );
}

/**
 * Recursively check if any device in the provided device list is an instrument
 * @param {Array} devices - Array of processed device objects
 * @returns {boolean} True if any instrument device is found (including nested in racks)
 */
function hasInstrumentInDevices(devices) {
  if (!devices || devices.length === 0) {
    return false;
  }

  for (const device of devices) {
    // Check if this device is an instrument
    if (isInstrumentDevice(device.type)) {
      return true;
    }

    // Recursively check chains for rack devices
    if (device.chains) {
      for (const chain of device.chains) {
        if (chain.devices && hasInstrumentInDevices(chain.devices)) {
          return true;
        }
      }
    }

    // For drum racks, we don't need to check drumPads here since we're checking
    // individual drum pad chains, not the entire drum rack structure
  }

  return false;
}

/**
 * Determine device type from Live API properties
 * @param {Object} device - Live API device object
 * @returns {string} Combined device type string
 */
export function getDeviceType(device) {
  const typeValue = device.getProperty("type");
  const canHaveChains = device.getProperty("can_have_chains");
  const canHaveDrumPads = device.getProperty("can_have_drum_pads");

  if (typeValue === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
    if (canHaveDrumPads) return DEVICE_TYPE.DRUM_RACK;
    if (canHaveChains) return DEVICE_TYPE.INSTRUMENT_RACK;
    return DEVICE_TYPE.INSTRUMENT;
  } else if (typeValue === LIVE_API_DEVICE_TYPE_AUDIO_EFFECT) {
    if (canHaveChains) return DEVICE_TYPE.AUDIO_EFFECT_RACK;
    return DEVICE_TYPE.AUDIO_EFFECT;
  } else if (typeValue === LIVE_API_DEVICE_TYPE_MIDI_EFFECT) {
    if (canHaveChains) return DEVICE_TYPE.MIDI_EFFECT_RACK;
    return DEVICE_TYPE.MIDI_EFFECT;
  }

  return "unknown";
}

/**
 * Extract track-level drum map from the processed device structure
 * This maintains API compatibility while using the new device structure as the source of truth
 * @param {Array} devices - Array of processed device objects (output from readDevice)
 * @returns {Object|null} Object mapping pitch names to drum pad names, or null if none found
 */
export function getDrumMap(devices) {
  // Recursively search for drum rack devices in the processed structure
  function findDrumRacksInDevices(deviceList) {
    const drumRacks = [];

    for (const device of deviceList) {
      if (device.type === DEVICE_TYPE.DRUM_RACK && device.drumPads) {
        drumRacks.push(device);
      }

      // Check chains for nested drum racks (in case of racks within racks)
      if (device.chains) {
        for (const chain of device.chains) {
          if (chain.devices) {
            drumRacks.push(...findDrumRacksInDevices(chain.devices));
          }
        }
      }
    }

    return drumRacks;
  }

  const drumRacks = findDrumRacksInDevices(devices);

  if (drumRacks.length === 0) {
    return null;
  }

  // Extract drum pads from the first found drum rack (matching original behavior)
  // Include only drum pads that have instrument devices (exclude those with hasInstrument: false)
  const drumMap = {};

  drumRacks[0].drumPads.forEach((drumPad) => {
    // Only include drum pads that have instruments (exclude those with hasInstrument: false)
    if (drumPad.hasInstrument !== false) {
      const pitchName = midiPitchToName(drumPad.note);
      drumMap[pitchName] = drumPad.name;
    }
  });

  // Return empty object if drum rack exists but has no playable drum pads
  // Return null only if no drum rack devices found at all
  return Object.keys(drumMap).length > 0 ? drumMap : {};
}

/**
 * Read device information including nested chains for rack devices
 * @param {Object} device - Live API device object
 * @param {Object} options - Options for reading device
 * @param {boolean} options.includeChains - Include chains in rack devices
 * @param {boolean} options.includeDrumChains - Include drum pad chains and return chains
 * @param {number} options.depth - Current recursion depth
 * @param {number} options.maxDepth - Maximum recursion depth
 * @returns {Object} Device object with nested structure
 */
export function readDevice(device, options = {}) {
  const {
    includeChains = true,
    includeDrumChains = false,
    depth = 0,
    maxDepth = 4,
  } = options;

  if (depth > maxDepth) {
    console.error(`Maximum recursion depth (${maxDepth}) exceeded`);
    return {};
  }

  const deviceType = getDeviceType(device);
  const className = device.getProperty("class_display_name");
  const userDisplayName = device.getProperty("name");

  const deviceInfo = {
    id: device.id,
    name: className, // Original device name
    type: deviceType,
  };

  // Only include deactivated when device is inactive
  const isActive = device.getProperty("is_active") > 0;
  if (!isActive) {
    deviceInfo.deactivated = true;
  }

  // Only include displayName when it differs from name
  if (userDisplayName !== className) {
    deviceInfo.displayName = userDisplayName;
  }

  // Add chain information for rack devices
  if (deviceType.includes("rack") && (includeChains || includeDrumChains)) {
    if (deviceType === DEVICE_TYPE.DRUM_RACK) {
      // Handle drum racks with drumPads structure
      const drumPads = device.getChildren("drum_pads");

      // First pass: create drum pad info with basic state computation
      const processedDrumPads = drumPads
        .filter((pad) => pad.getChildIds("chains").length > 0) // Only include pads with chains
        .map((pad) => {
          const chains = pad.getChildren("chains");
          const chain = chains[0]; // Each drum pad has exactly one chain
          const chainDevices = chain.getChildren("devices");

          const drumPadInfo = {
            name: pad.getProperty("name"),
            note: pad.getProperty("note"), // Always include raw MIDI note integer
            _originalPad: pad, // Keep reference for solo detection
            _originalChain: chain, // Keep reference for chain state
          };

          // Compute initial state (without muted_via_solo since drum pads don't have it)
          const isMuted = pad.getProperty("mute") > 0;
          const isSoloed = pad.getProperty("solo") > 0;

          if (isSoloed) {
            drumPadInfo.state = STATE.SOLOED;
          } else if (isMuted) {
            drumPadInfo.state = STATE.MUTED;
          }
          // No state property means "active" (will be post-processed if needed)

          // Only include chain when includeDrumChains is true
          if (includeDrumChains) {
            const processedChainDevices = chainDevices.map((chainDevice) =>
              readDevice(chainDevice, {
                includeChains,
                includeDrumChains,
                depth: depth + 1,
                maxDepth,
              }),
            );

            drumPadInfo.chain = {
              name: chain.getProperty("name"),
              devices: processedChainDevices,
            };

            // Add chain state property only if not default "active" state
            const chainState = computeState(chain);
            if (chainState !== STATE.ACTIVE) {
              drumPadInfo.chain.state = chainState;
            }

            // Check if this drum pad has instrument devices and add hasInstrument property only when false
            const hasInstrument = hasInstrumentInDevices(processedChainDevices);
            if (!hasInstrument) {
              drumPadInfo.hasInstrument = false;
            }
          } else {
            // When not including drum chains, we still need to check for instruments
            // to determine hasInstrument property
            const processedChainDevices = chainDevices.map((chainDevice) =>
              readDevice(chainDevice, {
                includeChains: false, // Don't include chains in processing
                includeDrumChains: false,
                depth: depth + 1,
                maxDepth,
              }),
            );
            const hasInstrument = hasInstrumentInDevices(processedChainDevices);
            if (!hasInstrument) {
              drumPadInfo.hasInstrument = false;
            }
          }

          return drumPadInfo;
        });

      // Check if any drum pads are soloed
      const hasSoloedDrumPad = processedDrumPads.some(
        (drumPadInfo) => drumPadInfo.state === STATE.SOLOED,
      );

      // Post-process drum pad states for solo behavior
      if (hasSoloedDrumPad) {
        processedDrumPads.forEach((drumPadInfo) => {
          if (drumPadInfo.state === STATE.SOLOED) {
            // Keep soloed state as-is
            return;
          } else if (drumPadInfo.state === STATE.MUTED) {
            // Muted pad in solo context becomes muted-also-via-solo
            drumPadInfo.state = STATE.MUTED_ALSO_VIA_SOLO;
          } else if (!drumPadInfo.state) {
            // Playing pad in solo context becomes muted-via-solo
            drumPadInfo.state = STATE.MUTED_VIA_SOLO;
          }
        });
      }

      // Clean up temporary references and set final drum pads
      deviceInfo.drumPads = processedDrumPads.map(
        ({ _originalPad, _originalChain, ...drumPadInfo }) => drumPadInfo,
      );
    } else {
      // Handle other rack devices (instrument racks, audio effect racks, etc.)
      const chains = device.getChildren("chains");

      // Check if any chains are soloed to determine hasSoloedChain (for all rack types)
      const hasSoloedChain = chains.some(
        (chain) => chain.getProperty("solo") > 0,
      );

      // Only include chains if includeChains is true
      if (includeChains) {
        deviceInfo.chains = chains.map((chain) => {
          const chainInfo = {
            name: chain.getProperty("name"),
          };

          // Add state property only if not default "active" state
          const chainState = computeState(chain);
          if (chainState !== STATE.ACTIVE) {
            chainInfo.state = chainState;
          }

          // Always include devices for non-drum racks
          chainInfo.devices = chain.getChildren("devices").map((chainDevice) =>
            readDevice(chainDevice, {
              includeChains,
              includeDrumChains,
              depth: depth + 1,
              maxDepth,
            }),
          );

          return chainInfo;
        });
      }

      // Only add hasSoloedChain property when it's true
      if (hasSoloedChain) {
        deviceInfo.hasSoloedChain = hasSoloedChain;
      }
    }

    // Check for return chains
    if (includeDrumChains) {
      const returnChains = device.getChildren("return_chains");
      if (returnChains.length > 0) {
        deviceInfo.returnChains = returnChains.map((chain) => {
          const returnChainInfo = {
            name: chain.getProperty("name"),
          };

          // Add state property only if not default "active" state
          const chainState = computeState(chain);
          if (chainState !== STATE.ACTIVE) {
            returnChainInfo.state = chainState;
          }

          // For drum racks, only include devices array when includeDrumChains is true
          // For other rack types, always include devices
          const shouldIncludeDevices =
            deviceType !== DEVICE_TYPE.DRUM_RACK || includeDrumChains;
          if (shouldIncludeDevices) {
            returnChainInfo.devices = chain
              .getChildren("devices")
              .map((chainDevice) =>
                readDevice(chainDevice, {
                  includeChains,
                  includeDrumChains,
                  depth: depth + 1,
                  maxDepth,
                }),
              );
          }

          return returnChainInfo;
        });
      }
    }
  }

  return deviceInfo;
}
