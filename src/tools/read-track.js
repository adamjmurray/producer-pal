// src/tools/read-track.js
import { getHostTrackIndex } from "../get-host-track-index.js";
import { VERSION } from "../version.js";
import { parseIncludeArray, READ_TRACK_DEFAULTS } from "./include-params.js";
import {
  DEVICE_TYPE,
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
  STATE,
} from "./constants.js";
import { readClip } from "./read-clip.js";
import { getDrumMap, readDevice } from "./shared/device-reader.js";

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
 * @param {number} args.trackIndex - Track index (0-based). Also used as returnTrackIndex for return tracks. Ignored for master track.
 * @param {string} args.trackType - Type of track: "regular" (default), "return", or "master"
 * @param {Array} args.include - Array of data to include in the response
 * @returns {Object} Result object with track information
 */
/**
 * Generic track reader that works with any track type
 * @param {Object} args - The parameters
 * @param {Object} args.track - LiveAPI track object
 * @param {number|null} args.trackIndex - Track index (null for master track)
 * @param {string} args.trackType - Track type: "regular", "return", or "master"
 * @param {boolean} args.includeDrumChains - Include drum chains
 * @param {boolean} args.includeNotes - Include notes in clips
 * @param {boolean} args.includeRackChains - Include rack chains
 * @param {boolean} args.includeMidiEffects - Include MIDI effects
 * @param {boolean} args.includeInstrument - Include instrument
 * @param {boolean} args.includeAudioEffects - Include audio effects
 * @param {boolean} args.includeRoutings - Include current routing settings
 * @param {boolean} args.includeAvailableRoutings - Include available routing options
 * @param {boolean} args.includeSessionClips - Include session clips
 * @param {boolean} args.includeArrangementClips - Include arrangement clips
 * @returns {Object} Track information
 */
export function readTrackGeneric({
  track,
  trackIndex,
  trackType = "regular",
  include,
}) {
  const {
    includeDrumChains,
    includeNotes,
    includeRackChains,
    includeMidiEffects,
    includeInstrument,
    includeAudioEffects,
    includeRoutings,
    includeAvailableRoutings,
    includeSessionClips,
    includeArrangementClips,
  } = parseIncludeArray(include, READ_TRACK_DEFAULTS);
  if (!track.exists()) {
    const result = {
      id: null,
      type: null,
      name: null,
    };

    // Add appropriate index property based on track type
    if (trackType === "regular") {
      result.trackIndex = trackIndex;
    } else if (trackType === "return") {
      result.returnTrackIndex = trackIndex;
    } else if (trackType === "master") {
      result.trackIndex = null;
    }

    return result;
  }

  const groupId = track.get("group_track")[1];
  const isMidiTrack = track.getProperty("has_midi_input") > 0;
  const isProducerPalHost =
    trackType === "regular" && trackIndex === getHostTrackIndex();
  const trackDevices = track.getChildren("devices");

  // Check track capabilities to avoid warnings
  const canBeArmed = track.getProperty("can_be_armed") > 0;
  const isGroup = track.getProperty("is_foldable") > 0;

  const result = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    name: track.getProperty("name"),
    color: track.getColor(),
    isArmed: canBeArmed ? track.getProperty("arm") > 0 : false,
    followsArrangement: track.getProperty("back_to_arranger") === 0,
    isGroup,
    isGroupMember: track.getProperty("is_grouped") > 0,
    groupId: groupId ? `${groupId}` : null, // id 0 means it doesn't exist, so convert to null
  };

  // Add track index properties based on track type
  if (trackType === "regular") {
    result.trackIndex = trackIndex;
  } else if (trackType === "return") {
    result.returnTrackIndex = trackIndex;
  }
  // Master track gets no index property

  // Session clips - only for regular tracks (return and master tracks don't have clip slots)
  if (trackType === "regular") {
    result.sessionClips = includeSessionClips
      ? track
          .getChildIds("clip_slots")
          .map((_clipSlotId, clipSlotIndex) =>
            readClip({
              trackIndex,
              clipSlotIndex,
              include: include,
            }),
          )
          .filter((clip) => clip.id != null)
      : track
          .getChildIds("clip_slots")
          .map((slotId, clipSlotIndex) => {
            const clip = new LiveAPI(`${slotId} clip`);
            return clip.exists() ? { clipId: clip.id, clipSlotIndex } : null;
          })
          .filter(Boolean);
  } else {
    // Return and master tracks don't have session clips
    result.sessionClips = [];
  }

  // Arrangement clips - group tracks, return tracks, and master track have no arrangement clips
  result.arrangementClips =
    isGroup || trackType === "return" || trackType === "master"
      ? [] // These track types have no arrangement clips
      : includeArrangementClips
        ? track
            .getChildIds("arrangement_clips")
            .map((clipId) =>
              readClip({
                clipId,
                include: include,
              }),
            )
            .filter((clip) => clip.id != null)
        : track.getChildIds("arrangement_clips").map((clipId) => ({ clipId }));

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
  const drumMap = getDrumMap(allDevices);
  if (drumMap != null) {
    result.drumMap = drumMap;
  }

  // Only include playingSlotIndex when >= 0 (only for regular tracks)
  if (trackType === "regular") {
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
  const trackState = computeState(track, trackType);
  if (trackState !== STATE.ACTIVE) {
    result.state = trackState;
  }

  // Handle current routing settings
  if (includeRoutings) {
    // Master track has no routing properties
    if (trackType === "master") {
      result.inputRoutingType = null;
      result.inputRoutingChannel = null;
      result.outputRoutingType = null;
      result.outputRoutingChannel = null;
    } else {
      // Transform current input routing settings - only for regular tracks (not return or group tracks)
      if (!isGroup && trackType === "regular") {
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
      } else if (trackType === "return") {
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
    if (trackType === "master") {
      result.availableInputRoutingTypes = [];
      result.availableInputRoutingChannels = [];
      result.availableOutputRoutingTypes = [];
      result.availableOutputRoutingChannels = [];
    } else {
      // Transform available input routing types - only for regular tracks (not return or group tracks)
      if (!isGroup && trackType === "regular") {
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
      } else if (trackType === "return") {
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

export function readTrack(args = {}) {
  const { trackIndex, trackId, trackType = "regular" } = args;

  // Validate parameters
  if (trackId == null && trackIndex == null && trackType !== "master") {
    throw new Error("Either trackId or trackIndex must be provided");
  }

  let track;
  let resolvedTrackIndex = trackIndex;
  let resolvedTrackType = trackType;

  if (trackId != null) {
    // Use trackId to access track directly
    track = LiveAPI.from(trackId);
    if (!track.exists()) {
      throw new Error(`No track exists for trackId "${trackId}"`);
    }

    // Determine track type and index from the track's path
    resolvedTrackType = track.trackType;
    resolvedTrackIndex = track.trackIndex ?? track.returnTrackIndex ?? null;
  } else {
    // Construct the appropriate Live API path based on track type
    let trackPath;
    if (trackType === "regular") {
      trackPath = `live_set tracks ${trackIndex}`;
    } else if (trackType === "return") {
      trackPath = `live_set return_tracks ${trackIndex}`;
    } else if (trackType === "master") {
      trackPath = "live_set master_track";
    } else {
      throw new Error(
        `Invalid trackType: ${trackType}. Must be "regular", "return", or "master".`,
      );
    }

    track = new LiveAPI(trackPath);
  }

  return readTrackGeneric({
    track,
    trackIndex: resolvedTrackType === "master" ? null : resolvedTrackIndex,
    trackType: resolvedTrackType,
    include: args.include,
  });
}
