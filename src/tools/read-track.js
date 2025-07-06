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
 * Find drum pads on a track, including those nested in instrument racks
 * @param {Object} track - Live API track object
 * @returns {Array|null} Array of drum pad objects or null if none found
 */
function findDrumPads(track) {
  const devices = track.getChildren("devices");

  // First, look for direct drum racks
  const directDrumRack = devices.find((device) =>
    device.getProperty("can_have_drum_pads"),
  );
  if (directDrumRack) {
    return extractDrumPads(directDrumRack);
  }

  // Then, look for drum racks nested in instrument racks
  for (const device of devices) {
    // Check if this is an instrument rack
    if (device.getProperty("class_name") === "InstrumentGroupDevice") {
      const chains = device.getChildren("chains");
      if (chains.length > 0) {
        // Check first device in first chain
        const chainDevices = chains[0].getChildren("devices");
        if (chainDevices.length > 0) {
          const firstChainDevice = chainDevices[0];
          if (firstChainDevice.getProperty("can_have_drum_pads")) {
            return extractDrumPads(firstChainDevice);
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract drum pad information from a drum rack device
 * @param {Object} drumRack - Live API drum rack device object
 * @returns {Array} Array of drum pad objects
 */
function extractDrumPads(drumRack) {
  return drumRack
    .getChildren("drum_pads")
    .filter((pad) => pad.getChildIds("chains").length) // ignore empty pads with no device chains that can't produce sound
    .map((pad) => ({
      pitch: midiPitchToName(pad.getProperty("note")),
      name: pad.getProperty("name"),
    }));
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
 * Check if device is an audio effect type (audio effect or audio effect rack)
 * @param {string} deviceType - Device type string
 * @returns {boolean} True if device is an audio effect type
 */
function isAudioEffectDevice(deviceType) {
  return (
    deviceType === DEVICE_TYPE.AUDIO_EFFECT ||
    deviceType === DEVICE_TYPE.AUDIO_EFFECT_RACK
  );
}

/**
 * Check if device is a MIDI effect type (midi effect or midi effect rack)
 * @param {string} deviceType - Device type string
 * @returns {boolean} True if device is a MIDI effect type
 */
function isMidiEffectDevice(deviceType) {
  return (
    deviceType === DEVICE_TYPE.MIDI_EFFECT ||
    deviceType === DEVICE_TYPE.MIDI_EFFECT_RACK
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
 * @returns {Object} Object with hasInstrument, hasAudioEffects, hasMidiEffects properties
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
      hasAudioEffects: false,
      hasMidiEffects: false,
    };
  }

  let hasInstrument = false;
  let hasAudioEffects = false;
  let hasMidiEffects = false;

  for (const device of devices) {
    const deviceType = getDeviceType(device);

    if (isInstrumentDevice(deviceType)) {
      hasInstrument = true;
    } else if (isAudioEffectDevice(deviceType)) {
      hasAudioEffects = true;
    } else if (isMidiEffectDevice(deviceType)) {
      hasMidiEffects = true;
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
        hasAudioEffects = hasAudioEffects || chainProps.hasAudioEffects;
        hasMidiEffects = hasMidiEffects || chainProps.hasMidiEffects;
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
        hasAudioEffects = hasAudioEffects || chainProps.hasAudioEffects;
        hasMidiEffects = hasMidiEffects || chainProps.hasMidiEffects;
      }
    }
  }

  const result = {};

  // Only include hasInstrument for MIDI tracks, and omit from Producer Pal host track unless true
  if (isMidiTrack && (!isProducerPalHost || hasInstrument)) {
    result.hasInstrument = hasInstrument;
  }

  // Include hasAudioEffects for all track types
  result.hasAudioEffects = hasAudioEffects;

  // Only include hasMidiEffects for MIDI tracks, and omit from Producer Pal host track unless true
  if (isMidiTrack && (!isProducerPalHost || hasMidiEffects)) {
    result.hasMidiEffects = hasMidiEffects;
  }

  return result;
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
      const chains = device.getChildren("chains");

      // Check if any chains are soloed to determine hasSoloedChain (for all rack types)
      const hasSoloedChain = chains.some(
        (chain) => chain.getProperty("solo") > 0,
      );

      // For drum racks when includeDrumRackDevices=false, include chains but omit devices within chains
      const shouldIncludeDevicesInChains =
        deviceType !== DEVICE_TYPE.DRUM_RACK || includeDrumRackDevices;

      deviceInfo.chains = chains.map((chain) => {
        const chainInfo = {
          name: chain.getProperty("name"),
          color: chain.getColor(),
          isMuted: chain.getProperty("mute") > 0,
          isSoloed: chain.getProperty("solo") > 0,
        };

        // Only include devices array when appropriate
        if (shouldIncludeDevicesInChains) {
          chainInfo.devices = getDevicesWithChains(
            chain.getChildren("devices"),
            includeDrumRackDevices,
            depth + 1,
            maxDepth,
          );
        }

        return chainInfo;
      });

      // Only add hasSoloedChain property when it's true
      if (hasSoloedChain) {
        deviceInfo.hasSoloedChain = hasSoloedChain;
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

          // Only include devices array when appropriate
          if (shouldIncludeDevicesInChains) {
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

    drumPads: findDrumPads(track),

    // List all devices on the track with nested chain structure
    devices: getDevicesWithChains(trackDevices, includeDrumRackDevices),
  };

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
