// src/tools/read-track.js
import { getHostTrackIndex } from "../get-host-track-index";
import { midiPitchToName } from "../notation/midi-pitch-to-name";
import { VERSION } from "../version";
import { readClip } from "./read-clip";

export const LIVE_API_DEVICE_TYPE_INSTRUMENT = 1;
export const LIVE_API_DEVICE_TYPE_AUDIO_EFFECT = 2;
export const LIVE_API_DEVICE_TYPE_MIDI_EFFECT = 4;

// Device type string constants (7 valid types)
export const DEVICE_TYPE = {
  INSTRUMENT: "instrument",
  INSTRUMENT_RACK: "instrument rack",
  DRUM_RACK: "drum rack",
  AUDIO_EFFECT: "audio effect",
  AUDIO_EFFECT_RACK: "audio effect rack",
  MIDI_EFFECT: "midi effect",
  MIDI_EFFECT_RACK: "midi effect rack",
};

// Array of all valid device types for documentation
export const DEVICE_TYPES = Object.values(DEVICE_TYPE);

/**
 * Extract track-level drum map from the processed device structure
 * This maintains API compatibility while using the new device structure as the source of truth
 * @param {Array} devices - Array of processed device objects (output from getDevicesWithChains)
 * @returns {Object|null} Object mapping pitch names to drum pad names, or null if none found
 */
function extractTrackDrumMap(devices) {
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
  // Only include drum pads that have instruments (can produce sound)
  const drumMap = {};

  drumRacks[0].drumPads
    .filter((drumPad) => drumPad.hasInstrument) // Only pads with instruments
    .forEach((drumPad) => {
      const pitchName = midiPitchToName(drumPad.note);
      drumMap[pitchName] = drumPad.name;
    });

  // Return empty object if drum rack exists but has no playable drum pads
  // Return null only if no drum rack devices found at all
  return Object.keys(drumMap).length > 0 ? drumMap : {};
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
 * Determine device type from Live API properties
 * @param {Object} device - Live API device object
 * @returns {string} Combined device type string
 */
function getDeviceType(device) {
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
 * Compute track-level device properties by scanning all devices recursively
 * @param {Array} devices - Array of Live API device objects
 * @param {boolean} isMidiTrack - Whether this is a MIDI track
 * @param {boolean} isProducerPalHost - Whether this is the Producer Pal host track
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Object} Object with hasInstrument property
 */
function computeTrackDeviceProperties(
  devices,
  isMidiTrack,
  isProducerPalHost,
  depth = 0,
  maxDepth = 4,
) {
  if (depth > maxDepth) {
    return {
      hasInstrument: false,
    };
  }

  let hasInstrument = false;

  for (const device of devices) {
    const deviceType = getDeviceType(device);

    if (isInstrumentDevice(deviceType)) {
      hasInstrument = true;
    }

    // Recursively check devices in chains for rack devices
    if (deviceType.includes("rack")) {
      const chains = device.getChildren("chains");
      for (const chain of chains) {
        const chainDevices = chain.getChildren("devices");
        const chainProps = computeTrackDeviceProperties(
          chainDevices,
          isMidiTrack,
          isProducerPalHost,
          depth + 1,
          maxDepth,
        );
        hasInstrument = hasInstrument || chainProps.hasInstrument;
      }

      // Also check return chains
      const returnChains = device.getChildren("return_chains");
      for (const chain of returnChains) {
        const chainDevices = chain.getChildren("devices");
        const chainProps = computeTrackDeviceProperties(
          chainDevices,
          isMidiTrack,
          isProducerPalHost,
          depth + 1,
          maxDepth,
        );
        hasInstrument = hasInstrument || chainProps.hasInstrument;
      }
    }
  }

  const result = {};

  // Only include hasInstrument for MIDI tracks, and omit from Producer Pal host track unless true
  if (isMidiTrack && (!isProducerPalHost || hasInstrument)) {
    result.hasInstrument = hasInstrument;
  }

  return result;
}

/**
 * Analyze devices in a drum pad chain to determine if it has instruments
 * @param {Array} chainDevices - Array of devices in a drum pad chain
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Object} Object with hasInstrument property
 */
function analyzeDrumPadChainDevices(chainDevices, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) {
    return {
      hasInstrument: false,
    };
  }

  let hasInstrument = false;

  for (const device of chainDevices) {
    const deviceType = getDeviceType(device);

    if (isInstrumentDevice(deviceType)) {
      hasInstrument = true;
    }

    // Recursively check devices in chains for rack devices
    if (deviceType.includes("rack")) {
      const chains = device.getChildren("chains");
      for (const chain of chains) {
        const nestedChainDevices = chain.getChildren("devices");
        const chainProps = analyzeDrumPadChainDevices(
          nestedChainDevices,
          depth + 1,
          maxDepth,
        );
        hasInstrument = hasInstrument || chainProps.hasInstrument;
      }

      // Also check return chains
      const returnChains = device.getChildren("return_chains");
      for (const chain of returnChains) {
        const nestedChainDevices = chain.getChildren("devices");
        const chainProps = analyzeDrumPadChainDevices(
          nestedChainDevices,
          depth + 1,
          maxDepth,
        );
        hasInstrument = hasInstrument || chainProps.hasInstrument;
      }
    }
  }

  return { hasInstrument };
}

/**
 * Build nested device structure with chains for rack devices
 * @param {Array} devices - Array of Live API device objects
 * @param {boolean} includeDrumRackDevices - Whether to include drum rack devices
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Array} Nested array of device objects with chains
 */
function getDevicesWithChains(
  devices,
  includeDrumRackDevices = true,
  depth = 0,
  maxDepth = 4,
) {
  if (depth > maxDepth) {
    console.error(`Maximum recursion depth (${maxDepth}) exceeded`);
    return [];
  }

  return devices.map((device) => {
    const deviceType = getDeviceType(device);
    const className = device.getProperty("class_display_name");
    const userDisplayName = device.getProperty("name");

    const deviceInfo = {
      id: device.id,
      name: className, // Original device name
      type: deviceType,
      isActive: device.getProperty("is_active") > 0,
    };

    // Only include displayName when it differs from name
    if (userDisplayName !== className) {
      deviceInfo.displayName = userDisplayName;
    }

    // Add chain information for rack devices
    if (deviceType.includes("rack")) {
      if (deviceType === DEVICE_TYPE.DRUM_RACK) {
        // Handle drum racks with drumPads structure
        const drumPads = device.getChildren("drum_pads");

        deviceInfo.drumPads = drumPads
          .filter((pad) => pad.getChildIds("chains").length > 0) // Only include pads with chains
          .map((pad) => {
            const chains = pad.getChildren("chains");
            const chain = chains[0]; // Each drum pad has exactly one chain
            const chainDevices = chain.getChildren("devices");

            // Analyze chain devices to determine if it has instruments
            const deviceTypes = analyzeDrumPadChainDevices(chainDevices);

            const drumPadInfo = {
              name: pad.getProperty("name"),
              note: pad.getProperty("note"), // Always include raw MIDI note integer
              mute: pad.getProperty("mute") > 0,
              solo: pad.getProperty("solo") > 0,
              hasInstrument: deviceTypes.hasInstrument,
              chain: {
                name: chain.getProperty("name"),
                color: chain.getColor(),
                isMuted: chain.getProperty("mute") > 0,
                isSoloed: chain.getProperty("solo") > 0,
              },
            };

            // Only include devices array when appropriate
            if (includeDrumRackDevices) {
              drumPadInfo.chain.devices = getDevicesWithChains(
                chainDevices,
                includeDrumRackDevices,
                depth + 1,
                maxDepth,
              );
            }

            return drumPadInfo;
          });

        // Check if any drum pads are soloed
        const hasSoloedDrumPad = drumPads.some(
          (pad) => pad.getProperty("solo") > 0,
        );
        if (hasSoloedDrumPad) {
          deviceInfo.hasSoloedDrumPad = hasSoloedDrumPad;
        }
      } else {
        // Handle other rack devices (instrument racks, audio effect racks, etc.)
        const chains = device.getChildren("chains");

        // Check if any chains are soloed to determine hasSoloedChain (for all rack types)
        const hasSoloedChain = chains.some(
          (chain) => chain.getProperty("solo") > 0,
        );

        deviceInfo.chains = chains.map((chain) => {
          const chainInfo = {
            name: chain.getProperty("name"),
            color: chain.getColor(),
            isMuted: chain.getProperty("mute") > 0,
            isSoloed: chain.getProperty("solo") > 0,
          };

          // Always include devices for non-drum racks
          chainInfo.devices = getDevicesWithChains(
            chain.getChildren("devices"),
            includeDrumRackDevices,
            depth + 1,
            maxDepth,
          );

          return chainInfo;
        });

        // Only add hasSoloedChain property when it's true
        if (hasSoloedChain) {
          deviceInfo.hasSoloedChain = hasSoloedChain;
        }
      }

      // Check for return chains
      const returnChains = device.getChildren("return_chains");
      if (returnChains.length > 0) {
        deviceInfo.returnChains = returnChains.map((chain) => {
          const returnChainInfo = {
            name: chain.getProperty("name"),
            color: chain.getColor(),
            isMuted: chain.getProperty("mute") > 0,
            isSoloed: chain.getProperty("solo") > 0,
          };

          // For drum racks, only include devices array when includeDrumRackDevices is true
          // For other rack types, always include devices
          const shouldIncludeDevices =
            deviceType !== DEVICE_TYPE.DRUM_RACK || includeDrumRackDevices;
          if (shouldIncludeDevices) {
            returnChainInfo.devices = getDevicesWithChains(
              chain.getChildren("devices"),
              includeDrumRackDevices,
              depth + 1,
              maxDepth,
            );
          }

          return returnChainInfo;
        });
      }
    }

    return deviceInfo;
  });
}

/**
 * Read comprehensive information about a track
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {boolean} args.includeDrumRackDevices - Whether to include drum rack devices (used internally by read-song)
 * @returns {Object} Result object with track information
 */
export function readTrack({ trackIndex, includeDrumRackDevices = true } = {}) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    return {
      id: null,
      type: null,
      name: null,
      trackIndex,
    };
  }

  const groupId = track.get("group_track")[1];
  const isMidiTrack = track.getProperty("has_midi_input") > 0;
  const isProducerPalHost = trackIndex === getHostTrackIndex();
  const trackDevices = track.getChildren("devices");

  const result = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    name: track.getProperty("name"),
    trackIndex,
    color: track.getColor(),
    isMuted: track.getProperty("mute") > 0,
    isSoloed: track.getProperty("solo") > 0,
    isArmed: track.getProperty("arm") > 0,
    playingSlotIndex: track.getProperty("playing_slot_index"),
    firedSlotIndex: track.getProperty("fired_slot_index"),
    followsArrangement: track.getProperty("back_to_arranger") === 0,
    isGroup: track.getProperty("is_foldable") > 0,
    isGroupMember: track.getProperty("is_grouped") > 0,
    groupId: groupId ? `${groupId}` : null, // id 0 means it doesn't exist, so convert to null

    sessionClips: track
      .getChildIds("clip_slots")
      .map((_clipSlotId, clipSlotIndex) =>
        readClip({ trackIndex, clipSlotIndex }),
      )
      .filter((clip) => clip.id != null),

    arrangementClips: track
      .getChildIds("arrangement_clips")
      .map((clipId) => readClip({ clipId }))
      .filter((clip) => clip.id != null),

    // List all devices on the track with nested chain structure
    devices: getDevicesWithChains(trackDevices, includeDrumRackDevices),
  };

  // Extract drum map from the processed device structure
  result.drumMap = extractTrackDrumMap(result.devices);

  // Add track-level device properties
  const deviceProperties = computeTrackDeviceProperties(
    trackDevices,
    isMidiTrack,
    isProducerPalHost,
  );
  Object.assign(result, deviceProperties);

  if (isProducerPalHost) {
    result.hasProducerPalDevice = true;
    result.producerPalVersion = VERSION;
  }

  return result;
}
