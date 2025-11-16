import * as console from "../../shared/v8-max-console.js";
import { VERSION } from "../../shared/version.js";
import { readClip } from "../clip/read-clip.js";
import {
  DEVICE_TYPE,
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
  STATE,
} from "../constants.js";
import {
  cleanupInternalDrumChains,
  getDrumMap,
  readDevice,
} from "../shared/device-reader.js";
import { getHostTrackIndex } from "../shared/get-host-track-index.js";
import { validateIdType } from "../shared/id-validation.js";
import {
  parseIncludeArray,
  READ_TRACK_DEFAULTS,
} from "../shared/include-params.js";

/**
 * Compute the state of a Live object (track, drum pad, or chain) based on mute/solo properties
 * @param {Object} liveObject - Live API object with mute, solo, and muted_via_solo properties
 * @returns {string} State: "active" | "muted" | "muted-via-solo" | "muted-also-via-solo" | "soloed"
 */
function computeState(liveObject, category = "regular") {
  // Master track doesn't have mute/solo/muted_via_solo properties
  if (category === "master") {
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
    const processedDevice = readDevice(device, {
      includeChains: includeRackChains,
      includeDrumChains,
    });

    // Use processed device type for proper rack categorization
    const deviceType = processedDevice.type;

    if (
      deviceType.startsWith(DEVICE_TYPE.MIDI_EFFECT) ||
      deviceType.startsWith(DEVICE_TYPE.MIDI_EFFECT_RACK)
    ) {
      midiEffects.push(processedDevice);
    } else if (
      deviceType.startsWith(DEVICE_TYPE.INSTRUMENT) ||
      deviceType.startsWith(DEVICE_TYPE.INSTRUMENT_RACK) ||
      deviceType.startsWith(DEVICE_TYPE.DRUM_RACK)
    ) {
      instruments.push(processedDevice);
    } else if (
      deviceType.startsWith(DEVICE_TYPE.AUDIO_EFFECT) ||
      deviceType.startsWith(DEVICE_TYPE.AUDIO_EFFECT_RACK)
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

// Helper function to strip chains from device objects
function stripChains(device) {
  if (!device || typeof device !== "object") {
    return device;
  }
  const { chains: _chains, ...rest } = device;
  return rest;
}

/**
 * Generic track reader that works with any track type. This is an internal helper function
 * used by readTrack to read comprehensive information about tracks.
 * @param {Object} args - The parameters
 * @param {LiveAPI} args.track - LiveAPI track object
 * @param {number|null} args.trackIndex - Track index (null for master track)
 * @param {string} [args.category="regular"] - Track category: "regular", "return", or "master"
 * @param {Array<string>} [args.include] - Array of data to include in the response
 * @returns {Object} Track information including clips, devices, routing, and state
 */
export function readTrackGeneric({
  track,
  trackIndex,
  category = "regular",
  include,
}) {
  const {
    includeDrumChains,
    includeDrumMaps,
    includeRackChains,
    includeMidiEffects,
    includeInstruments,
    includeAudioEffects,
    includeRoutings,
    includeAvailableRoutings,
    includeSessionClips,
    includeArrangementClips,
    includeColor,
  } = parseIncludeArray(include, READ_TRACK_DEFAULTS);
  if (!track.exists()) {
    const result = {
      id: null,
      type: null,
      name: null,
    };

    // Add appropriate index property based on track category
    if (category === "regular") {
      result.trackIndex = trackIndex;
    } else if (category === "return") {
      result.returnTrackIndex = trackIndex;
    } else if (category === "master") {
      result.trackIndex = null;
    }

    return result;
  }

  const groupId = track.get("group_track")[1];
  const isMidiTrack = track.getProperty("has_midi_input") > 0;
  const isProducerPalHost =
    category === "regular" && trackIndex === getHostTrackIndex();
  const trackDevices = track.getChildren("devices");

  // Check track capabilities to avoid warnings
  const canBeArmed = track.getProperty("can_be_armed") > 0;
  const isGroup = track.getProperty("is_foldable") > 0;

  const result = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    name: track.getProperty("name"),
    ...(includeColor && { color: track.getColor() }),
    arrangementFollower: track.getProperty("back_to_arranger") === 0,
  };

  // Only include isArmed when true
  const isArmed = canBeArmed ? track.getProperty("arm") > 0 : false;
  if (isArmed) {
    result.isArmed = isArmed;
  }

  // Only include isGroup when true
  if (isGroup) {
    result.isGroup = isGroup;
  }

  // Only include isGroupMember when true
  const isGroupMember = track.getProperty("is_grouped") > 0;
  if (isGroupMember) {
    result.isGroupMember = isGroupMember;
  }

  // only include groupId when not null/empty/0
  if (groupId) {
    result.groupId = `${groupId}`;
  }

  // Add track index properties based on track category
  if (category === "regular") {
    result.trackIndex = trackIndex;
  } else if (category === "return") {
    result.returnTrackIndex = trackIndex;
  }
  // Master track gets no index property

  // Session clips - only for regular tracks (return and master tracks don't have clip slots)
  if (category === "regular") {
    if (includeSessionClips) {
      result.sessionClips = track
        .getChildIds("clip_slots")
        .map((_clipSlotId, sceneIndex) =>
          readClip({
            trackIndex,
            sceneIndex,
            include: include,
          }),
        )
        .filter((clip) => clip.id != null);
    } else {
      // When not including full clip details, just return the count
      result.sessionClipCount = track
        .getChildIds("clip_slots")
        .map((_clipSlotId, sceneIndex) => {
          const clip = new LiveAPI(
            `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
          );
          return clip.exists() ? clip : null;
        })
        .filter(Boolean).length;
    }
  } else if (includeSessionClips) {
    // Return and master tracks don't have session clips
    result.sessionClips = [];
  } else {
    result.sessionClipCount = 0;
  }

  // Arrangement clips - group tracks, return tracks, and master track have no arrangement clips
  if (isGroup || category === "return" || category === "master") {
    // These track categories have no arrangement clips
    if (includeArrangementClips) {
      result.arrangementClips = [];
    } else {
      result.arrangementClipCount = 0;
    }
  } else if (includeArrangementClips) {
    result.arrangementClips = track
      .getChildIds("arrangement_clips")
      .map((clipId) =>
        readClip({
          clipId,
          include: include,
        }),
      )
      .filter((clip) => clip.id != null);
  } else {
    // When not including full clip details, just return the count
    const clipIds = track.getChildIds("arrangement_clips");
    result.arrangementClipCount = clipIds.length;
  }

  // Categorize devices into separate arrays
  // When includeDrumMaps is true but includeRackChains is false, we need to get chains
  // to extract drum maps but then strip them from the final result
  const shouldFetchChainsForDrumMaps = includeDrumMaps && !includeRackChains;
  const categorizedDevices = categorizeDevices(
    trackDevices,
    includeDrumChains,
    shouldFetchChainsForDrumMaps ? true : includeRackChains,
  );

  // Add device categories based on inclusion flags
  if (includeMidiEffects) {
    result.midiEffects = shouldFetchChainsForDrumMaps
      ? categorizedDevices.midiEffects.map(stripChains)
      : categorizedDevices.midiEffects;
  }
  if (includeInstruments) {
    // For Producer Pal host track, omit instrument property when it's null
    if (isProducerPalHost && categorizedDevices.instrument === null) {
      // Don't include instrument property at all
    } else {
      result.instrument =
        shouldFetchChainsForDrumMaps && categorizedDevices.instrument
          ? stripChains(categorizedDevices.instrument)
          : categorizedDevices.instrument;
    }
  }
  if (includeAudioEffects) {
    result.audioEffects = shouldFetchChainsForDrumMaps
      ? categorizedDevices.audioEffects.map(stripChains)
      : categorizedDevices.audioEffects;
  }

  // Extract drum map from all categorized devices when requested
  if (includeDrumMaps) {
    const allDevices = [
      ...categorizedDevices.midiEffects,
      ...(categorizedDevices.instrument ? [categorizedDevices.instrument] : []),
      ...categorizedDevices.audioEffects,
    ];
    const drumMap = getDrumMap(allDevices);
    if (drumMap != null) {
      result.drumMap = drumMap;
    }
  }

  // Clean up internal _processedDrumChains property after drumMap extraction
  if (result.midiEffects) {
    result.midiEffects = cleanupInternalDrumChains(result.midiEffects);
  }
  if (result.instrument) {
    result.instrument = cleanupInternalDrumChains(result.instrument);
  }
  if (result.audioEffects) {
    result.audioEffects = cleanupInternalDrumChains(result.audioEffects);
  }

  // Only include playingSlotIndex when >= 0 (only for regular tracks)
  if (category === "regular") {
    const playingSlotIndex = track.getProperty("playing_slot_index");
    if (playingSlotIndex >= 0) {
      result.playingSlotIndex = playingSlotIndex;
    }

    // Only include firedSlotIndex when >= 0 (only for regular tracks)
    const firedSlotIndex = track.getProperty("fired_slot_index");
    if (firedSlotIndex >= 0) {
      result.firedSlotIndex = firedSlotIndex;
    }
  }

  // Add state property only if not default "active" state
  const trackState = computeState(track, category);
  if (trackState !== STATE.ACTIVE) {
    result.state = trackState;
  }

  // Handle current routing settings
  if (includeRoutings) {
    // Master track has no routing properties
    if (category === "master") {
      result.inputRoutingType = null;
      result.inputRoutingChannel = null;
      result.outputRoutingType = null;
      result.outputRoutingChannel = null;
    } else {
      // Transform current input routing settings - only for regular tracks (not return or group tracks)
      if (!isGroup && category === "regular") {
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
      } else if (category === "return") {
        // Return tracks don't have input routing - set null
        result.inputRoutingType = null;
        result.inputRoutingChannel = null;
      }
      // Group tracks don't set these properties at all (remain undefined)

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
  }

  // Handle available routing options
  if (includeAvailableRoutings) {
    // Master track has no routing properties
    if (category === "master") {
      result.availableInputRoutingTypes = [];
      result.availableInputRoutingChannels = [];
      result.availableOutputRoutingTypes = [];
      result.availableOutputRoutingChannels = [];
    } else {
      // Transform available input routing types - only for regular tracks (not return or group tracks)
      if (!isGroup && category === "regular") {
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
      } else if (category === "return") {
        // Return tracks don't have input routing - set empty arrays
        result.availableInputRoutingTypes = [];
        result.availableInputRoutingChannels = [];
      }
      // Group tracks don't set these properties at all (remain undefined)

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
    }
  }

  if (isProducerPalHost) {
    result.hasProducerPalDevice = true;
    result.producerPalVersion = VERSION;
  }

  return result;
}

export function readTrack(args = {}, _context = {}) {
  const { trackIndex, trackId, category = "regular" } = args;

  // Validate parameters
  if (trackId == null && trackIndex == null && category !== "master") {
    throw new Error("Either trackId or trackIndex must be provided");
  }

  let track;
  let resolvedTrackIndex = trackIndex;
  let resolvedCategory = category;

  if (trackId != null) {
    // Use trackId to access track directly and validate it's a track
    track = validateIdType(trackId, "track", "readTrack");

    // Determine track category and index from the track's path
    resolvedCategory = track.category;
    resolvedTrackIndex = track.trackIndex ?? track.returnTrackIndex ?? null;
  } else {
    // Construct the appropriate Live API path based on track category
    let trackPath;
    if (category === "regular") {
      trackPath = `live_set tracks ${trackIndex}`;
    } else if (category === "return") {
      trackPath = `live_set return_tracks ${trackIndex}`;
    } else if (category === "master") {
      trackPath = "live_set master_track";
    } else {
      throw new Error(
        `Invalid category: ${category}. Must be "regular", "return", or "master".`,
      );
    }

    track = new LiveAPI(trackPath);
  }

  return readTrackGeneric({
    track,
    trackIndex: resolvedCategory === "master" ? null : resolvedTrackIndex,
    category: resolvedCategory,
    include: args.include,
  });
}
