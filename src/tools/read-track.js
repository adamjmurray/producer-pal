// src/tools/read-track.js
import { getHostTrackIndex } from "../get-host-track-index.js";
import { midiPitchToName } from "../notation/midi-pitch-to-name.js";
import { VERSION } from "../version.js";
import { readClip } from "./read-clip.js";

export const LIVE_API_DEVICE_TYPE_INSTRUMENT = 1;
export const LIVE_API_DEVICE_TYPE_AUDIO_EFFECT = 2;
export const LIVE_API_DEVICE_TYPE_MIDI_EFFECT = 4;

// State string constants (5 valid states)
export const STATE = {
  ACTIVE: "active",
  MUTED: "muted",
  MUTED_VIA_SOLO: "muted-via-solo",
  MUTED_ALSO_VIA_SOLO: "muted-also-via-solo",
  SOLOED: "soloed",
};

// Device type string constants (7 valid types)
export const DEVICE_TYPE = {
  INSTRUMENT: "instrument",
  INSTRUMENT_RACK: "instrument-rack",
  DRUM_RACK: "drum-rack",
  AUDIO_EFFECT: "audio-effect",
  AUDIO_EFFECT_RACK: "audio-effect-rack",
  MIDI_EFFECT: "midi-effect",
  MIDI_EFFECT_RACK: "midi-effect-rack",
};

// Array of all valid device types for documentation
export const DEVICE_TYPES = Object.values(DEVICE_TYPE);

/**
 * Compute the state of a Live object (track, drum pad, or chain) based on mute/solo properties
 * @param {Object} liveObject - Live API object with mute, solo, and muted_via_solo properties
 * @returns {string} State: "active" | "muted" | "muted-via-solo" | "muted-also-via-solo" | "soloed"
 */
function computeState(liveObject) {
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
  // Include all drum pads that exist (have chains)
  const drumMap = {};

  drumRacks[0].drumPads.forEach((drumPad) => {
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
 * Build nested device structure with chains for rack devices
 * @param {Array} devices - Array of Live API device objects
 * @param {boolean} includeDrumChains - Whether to include drum pad chains and return chains
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Array} Nested array of device objects with chains
 */
function getDevicesWithChains(
  devices,
  includeDrumChains = false,
  includeRackChains = true,
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
              drumPadInfo.chain = {
                name: chain.getProperty("name"),
                color: chain.getColor(),
                devices: getDevicesWithChains(
                  chainDevices,
                  includeDrumChains,
                  includeRackChains,
                  depth + 1,
                  maxDepth,
                ),
              };

              // Add chain state property only if not default "active" state
              const chainState = computeState(chain);
              if (chainState !== STATE.ACTIVE) {
                drumPadInfo.chain.state = chainState;
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

        // Only include chains if includeRackChains is true
        if (includeRackChains) {
          deviceInfo.chains = chains.map((chain) => {
            const chainInfo = {
              name: chain.getProperty("name"),
              color: chain.getColor(),
            };

            // Add state property only if not default "active" state
            const chainState = computeState(chain);
            if (chainState !== STATE.ACTIVE) {
              chainInfo.state = chainState;
            }

            // Always include devices for non-drum racks
            chainInfo.devices = getDevicesWithChains(
              chain.getChildren("devices"),
              includeDrumChains,
              includeRackChains,
              depth + 1,
              maxDepth,
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
              color: chain.getColor(),
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
              returnChainInfo.devices = getDevicesWithChains(
                chain.getChildren("devices"),
                includeDrumChains,
                includeRackChains,
                depth + 1,
                maxDepth,
              );
            }

            return returnChainInfo;
          });
        }
      }
    }

    return deviceInfo;
  });
}

/**
 * Categorize devices into MIDI effects, instruments, and audio effects
 * @param {Array} devices - Array of Live API device objects
 * @param {boolean} includeDrumChains - Whether to include drum pad chains and return chains
 * @param {boolean} includeRackChains - Whether to include chains in rack devices
 * @returns {Object} Object with midiEffects, instrument, and audioEffects arrays
 */
function categorizeDevices(
  devices,
  includeDrumChains = false,
  includeRackChains = true,
) {
  const midiEffects = [];
  const instruments = [];
  const audioEffects = [];

  for (const device of devices) {
    const processedDevice = getDevicesWithChains(
      [device],
      includeDrumChains,
      includeRackChains,
    )[0];

    // Use processed device type for proper rack categorization
    const deviceType = processedDevice.type;

    if (
      deviceType === DEVICE_TYPE.MIDI_EFFECT ||
      deviceType === DEVICE_TYPE.MIDI_EFFECT_RACK
    ) {
      midiEffects.push(processedDevice);
    } else if (
      deviceType === DEVICE_TYPE.INSTRUMENT ||
      deviceType === DEVICE_TYPE.INSTRUMENT_RACK ||
      deviceType === DEVICE_TYPE.DRUM_RACK
    ) {
      instruments.push(processedDevice);
    } else if (
      deviceType === DEVICE_TYPE.AUDIO_EFFECT ||
      deviceType === DEVICE_TYPE.AUDIO_EFFECT_RACK
    ) {
      audioEffects.push(processedDevice);
    }
  }

  // Validate instrument count
  if (instruments.length > 1) {
    console.error(
      `Track has ${instruments.length} instruments, which is unusual. Expected 0 or 1.`,
    );
  }

  return {
    midiEffects,
    instrument: instruments.length > 0 ? instruments[0] : null,
    audioEffects,
  };
}

/**
 * Read comprehensive information about a track
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {boolean} args.includeDrumChains - Whether to include drum pad chains and return chains (default: false)
 * @param {boolean} args.includeNotes - Whether to include notes data in clips (default: true)
 * @param {boolean} args.includeRackChains - Whether to include chains in rack devices (default: true)
 * @param {boolean} args.includeMidiEffects - Whether to include MIDI effects array (default: false)
 * @param {boolean} args.includeInstrument - Whether to include instrument object (default: true)
 * @param {boolean} args.includeAudioEffects - Whether to include audio effects array (default: false)
 * @returns {Object} Result object with track information
 */
export function readTrack({
  trackIndex,
  includeDrumChains = false,
  includeNotes = true,
  includeRackChains = true,
  includeMidiEffects = false,
  includeInstrument = true,
  includeAudioEffects = false,
} = {}) {
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
        readClip({ trackIndex, clipSlotIndex, includeNotes }),
      )
      .filter((clip) => clip.id != null),

    arrangementClips: track
      .getChildIds("arrangement_clips")
      .map((clipId) => readClip({ clipId, includeNotes }))
      .filter((clip) => clip.id != null),
  };

  // Categorize devices into separate arrays
  const categorizedDevices = categorizeDevices(
    trackDevices,
    includeDrumChains,
    includeRackChains,
  );

  // Add device categories based on inclusion flags
  if (includeMidiEffects) {
    result.midiEffects = categorizedDevices.midiEffects;
  }
  if (includeInstrument) {
    result.instrument = categorizedDevices.instrument;
  }
  if (includeAudioEffects) {
    result.audioEffects = categorizedDevices.audioEffects;
  }

  // Extract drum map from all categorized devices (critical for drumMap preservation)
  const allDevices = [
    ...categorizedDevices.midiEffects,
    ...(categorizedDevices.instrument ? [categorizedDevices.instrument] : []),
    ...categorizedDevices.audioEffects,
  ];
  const drumMap = extractTrackDrumMap(allDevices);
  if (drumMap != null) {
    result.drumMap = drumMap;
  }

  // Add state property only if not default "active" state
  const trackState = computeState(track);
  if (trackState !== STATE.ACTIVE) {
    result.state = trackState;
  }


  if (isProducerPalHost) {
    result.hasProducerPalDevice = true;
    result.producerPalVersion = VERSION;
  }

  return result;
}
