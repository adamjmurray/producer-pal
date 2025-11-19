import * as console from "../../shared/v8-max-console.js";
import { VERSION } from "../../shared/version.js";
import { readClip } from "../clip/read-clip.js";
import { DEVICE_TYPE, STATE } from "../constants.js";
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
import {
  processCurrentRouting,
  processAvailableRouting,
} from "./track-routing-helpers.js";

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

/**
 * Process session clips for a track
 */
function processSessionClips(
  track,
  category,
  trackIndex,
  includeSessionClips,
  include,
) {
  if (category !== "regular") {
    return includeSessionClips ? { sessionClips: [] } : { sessionClipCount: 0 };
  }
  if (includeSessionClips) {
    const sessionClips = track
      .getChildIds("clip_slots")
      .map((_clipSlotId, sceneIndex) =>
        readClip({
          trackIndex,
          sceneIndex,
          include: include,
        }),
      )
      .filter((clip) => clip.id != null);
    return { sessionClips };
  }
  const sessionClipCount = track
    .getChildIds("clip_slots")
    .map((_clipSlotId, sceneIndex) => {
      const clip = new LiveAPI(
        `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
      );
      return clip.exists() ? clip : null;
    })
    .filter(Boolean).length;
  return { sessionClipCount };
}

/**
 * Process arrangement clips for a track
 */
function processArrangementClips(
  track,
  isGroup,
  category,
  includeArrangementClips,
  include,
) {
  if (isGroup || category === "return" || category === "master") {
    return includeArrangementClips
      ? { arrangementClips: [] }
      : { arrangementClipCount: 0 };
  }
  if (includeArrangementClips) {
    const arrangementClips = track
      .getChildIds("arrangement_clips")
      .map((clipId) =>
        readClip({
          clipId,
          include: include,
        }),
      )
      .filter((clip) => clip.id != null);
    return { arrangementClips };
  }
  const clipIds = track.getChildIds("arrangement_clips");
  return { arrangementClipCount: clipIds.length };
}

/**
 * Process and categorize track devices
 */
function processDevices(categorizedDevices, config) {
  const {
    includeMidiEffects,
    includeInstruments,
    includeAudioEffects,
    includeDrumMaps,
    includeRackChains,
    isProducerPalHost,
  } = config;
  const result = {};
  const shouldFetchChainsForDrumMaps = includeDrumMaps && !includeRackChains;
  if (includeMidiEffects) {
    result.midiEffects = shouldFetchChainsForDrumMaps
      ? categorizedDevices.midiEffects.map(stripChains)
      : categorizedDevices.midiEffects;
  }
  if (includeInstruments) {
    if (!(isProducerPalHost && categorizedDevices.instrument === null)) {
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
  return result;
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
  // Session clips
  Object.assign(
    result,
    processSessionClips(
      track,
      category,
      trackIndex,
      includeSessionClips,
      include,
    ),
  );
  // Arrangement clips
  Object.assign(
    result,
    processArrangementClips(
      track,
      isGroup,
      category,
      includeArrangementClips,
      include,
    ),
  );
  // Process devices
  const shouldFetchChainsForDrumMaps = includeDrumMaps && !includeRackChains;
  const categorizedDevices = categorizeDevices(
    trackDevices,
    includeDrumChains,
    shouldFetchChainsForDrumMaps ? true : includeRackChains,
  );
  const deviceResults = processDevices(categorizedDevices, {
    includeMidiEffects,
    includeInstruments,
    includeAudioEffects,
    includeDrumMaps,
    includeRackChains,
    isProducerPalHost,
  });
  Object.assign(result, deviceResults);
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
    Object.assign(
      result,
      processCurrentRouting(track, category, isGroup, canBeArmed),
    );
  }
  // Handle available routing options
  if (includeAvailableRoutings) {
    Object.assign(result, processAvailableRouting(track, category, isGroup));
  }
  if (isProducerPalHost) {
    result.hasProducerPalDevice = true;
    result.producerPalVersion = VERSION;
  }
  return result;
}

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
