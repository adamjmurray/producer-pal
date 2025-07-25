// src/tools/read-track.js
import { getHostTrackIndex } from "../get-host-track-index.js";
import { midiPitchToName } from "../notation/midi-pitch-to-name.js";
import { VERSION } from "../version.js";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
  STATE,
} from "./constants.js";
import { readClip } from "./read-clip.js";

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
              const processedChainDevices = getDevicesWithChains(
                chainDevices,
                includeDrumChains,
                includeRackChains,
                depth + 1,
                maxDepth,
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
              const hasInstrument = hasInstrumentInDevices(
                processedChainDevices,
              );
              if (!hasInstrument) {
                drumPadInfo.hasInstrument = false;
              }
            } else {
              // When not including drum chains, we still need to check for instruments
              // to determine hasInstrument property
              const processedChainDevices = getDevicesWithChains(
                chainDevices,
                false, // Don't include drum chains in processing
                includeRackChains,
                depth + 1,
                maxDepth,
              );
              const hasInstrument = hasInstrumentInDevices(
                processedChainDevices,
              );
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

        // Only include chains if includeRackChains is true
        if (includeRackChains) {
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
 * @param {boolean} args.includeRoutings - Whether to include input/output routing information (default: false)
 * @param {boolean} args.includeSessionClips - Whether to include full session clip data (default: true)
 * @param {boolean} args.includeArrangementClips - Whether to include full arrangement clip data (default: true)
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
  includeRoutings = false,
  includeSessionClips = true,
  includeArrangementClips = true,
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

  // Check track capabilities to avoid warnings
  const canBeArmed = track.getProperty("can_be_armed") > 0;
  const isGroup = track.getProperty("is_foldable") > 0;

  const result = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    name: track.getProperty("name"),
    trackIndex,
    color: track.getColor(),
    isArmed: canBeArmed ? track.getProperty("arm") > 0 : false,
    followsArrangement: track.getProperty("back_to_arranger") === 0,
    isGroup,
    isGroupMember: track.getProperty("is_grouped") > 0,
    groupId: groupId ? `${groupId}` : null, // id 0 means it doesn't exist, so convert to null

    sessionClips: includeSessionClips
      ? track
          .getChildIds("clip_slots")
          .map((_clipSlotId, clipSlotIndex) =>
            readClip({ trackIndex, clipSlotIndex, includeNotes }),
          )
          .filter((clip) => clip.id != null)
      : track
          .getChildIds("clip_slots")
          .map((slotId, clipSlotIndex) => {
            const clip = new LiveAPI(`${slotId} clip`);
            return clip.exists() ? { clipId: clip.id, clipSlotIndex } : null;
          })
          .filter(Boolean),

    arrangementClips: isGroup
      ? [] // Group tracks have no arrangement clips
      : includeArrangementClips
        ? track
            .getChildIds("arrangement_clips")
            .map((clipId) => readClip({ clipId, includeNotes }))
            .filter((clip) => clip.id != null)
        : track.getChildIds("arrangement_clips").map((clipId) => ({ clipId })),
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
    // For Producer Pal host track, omit instrument property when it's null
    if (isProducerPalHost && categorizedDevices.instrument === null) {
      // Don't include instrument property at all
    } else {
      result.instrument = categorizedDevices.instrument;
    }
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

  // Only include playingSlotIndex when >= 0
  const playingSlotIndex = track.getProperty("playing_slot_index");
  if (playingSlotIndex >= 0) {
    result.playingSlotIndex = playingSlotIndex;
  }

  // Only include firedSlotIndex when >= 0
  const firedSlotIndex = track.getProperty("fired_slot_index");
  if (firedSlotIndex >= 0) {
    result.firedSlotIndex = firedSlotIndex;
  }

  // Add state property only if not default "active" state
  const trackState = computeState(track);
  if (trackState !== STATE.ACTIVE) {
    result.state = trackState;
  }

  if (includeRoutings) {
    // Transform available input routing types - only for tracks that support input routing
    if (!isGroup) {
      const availableInputTypes =
        track.getProperty("available_input_routing_types") || [];
      result.availableInputRoutingTypes = availableInputTypes.map((type) => ({
        name: type.display_name,
        inputId: String(type.identifier),
      }));

      const availableInputChannels =
        track.getProperty("available_input_routing_channels") || [];
      result.availableInputRoutingChannels = availableInputChannels.map(
        (ch) => ({
          name: ch.display_name,
          inputId: String(ch.identifier),
        }),
      );
    }

    const availableOutputTypes =
      track.getProperty("available_output_routing_types") || [];
    result.availableOutputRoutingTypes = availableOutputTypes.map((type) => ({
      name: type.display_name,
      outputId: String(type.identifier),
    }));

    const availableOutputChannels =
      track.getProperty("available_output_routing_channels") || [];
    result.availableOutputRoutingChannels = availableOutputChannels.map(
      (ch) => ({
        name: ch.display_name,
        outputId: String(ch.identifier),
      }),
    );

    // Transform current input routing settings - only for tracks that support input routing
    if (!isGroup) {
      const inputType = track.getProperty("input_routing_type");
      result.inputRoutingType = inputType
        ? {
            name: inputType.display_name,
            inputId: String(inputType.identifier),
          }
        : null;

      const inputChannel = track.getProperty("input_routing_channel");
      result.inputRoutingChannel = inputChannel
        ? {
            name: inputChannel.display_name,
            inputId: String(inputChannel.identifier),
          }
        : null;
    }

    const outputType = track.getProperty("output_routing_type");
    result.outputRoutingType = outputType
      ? {
          name: outputType.display_name,
          outputId: String(outputType.identifier),
        }
      : null;

    const outputChannel = track.getProperty("output_routing_channel");
    result.outputRoutingChannel = outputChannel
      ? {
          name: outputChannel.display_name,
          outputId: String(outputChannel.identifier),
        }
      : null;

    // Add monitoring state - only for tracks that can be armed (excludes group/master/return tracks)
    if (canBeArmed) {
      const monitoringStateValue = track.getProperty(
        "current_monitoring_state",
      );
      result.monitoringState =
        {
          [LIVE_API_MONITORING_STATE_IN]: MONITORING_STATE.IN,
          [LIVE_API_MONITORING_STATE_AUTO]: MONITORING_STATE.AUTO,
          [LIVE_API_MONITORING_STATE_OFF]: MONITORING_STATE.OFF,
        }[monitoringStateValue] ?? "unknown";
    }
  }

  if (isProducerPalHost) {
    result.hasProducerPalDevice = true;
    result.producerPalVersion = VERSION;
  }

  return result;
}
