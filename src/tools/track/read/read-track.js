import * as console from "#src/shared/v8-max-console.js";
import { readClip } from "#src/tools/clip/read/read-clip.js";
import { DEVICE_TYPE } from "#src/tools/constants.js";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.js";
import {
  getDrumMap,
  readDevice,
} from "#src/tools/shared/device/device-reader.js";
import {
  parseIncludeArray,
  READ_TRACK_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.js";
import { validateIdType } from "#src/tools/shared/validation/id-validation.js";
import {
  addCategoryIndex,
  addOptionalBooleanProperties,
  addProducerPalHostInfo,
  addRoutingInfo,
  addSlotIndices,
  addStateIfNotDefault,
  cleanupDeviceChains,
  handleNonExistentTrack,
  readMixerProperties,
} from "./helpers/read-track-helpers.js";

/**
 * Read comprehensive information about a track
 * @param {object} args - The parameters
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Track information
 */
export function readTrack(args = {}, _context = {}) {
  const { trackIndex, trackId, category = "regular", returnTrackNames } = args;
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
    returnTrackNames,
  });
}

/**
 * Process session clips for a track
 * @param {LiveAPI} track - Track object
 * @param {string} category - Track category (regular, return, or master)
 * @param {number} trackIndex - Track index
 * @param {boolean} includeSessionClips - Whether to include full session clip details
 * @param {Array<string>} include - Include array for nested reads
 * @returns {object} - Object with session clips data
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
 * @param {LiveAPI} track - Track object
 * @param {boolean} isGroup - Whether the track is a group
 * @param {string} category - Track category (regular, return, or master)
 * @param {boolean} includeArrangementClips - Whether to include full arrangement clip details
 * @param {Array<string>} include - Include array for nested reads
 * @returns {object} Object with arrangementClips array or arrangementClipCount
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
 * @param {object} categorizedDevices - Object containing categorized device arrays
 * @param {object} config - Configuration object with device processing flags
 * @returns {object} Object with processed device arrays and optional drum map
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
 * @param {object} args - The parameters
 * @param {LiveAPI} args.track - LiveAPI track object
 * @param {number|null} args.trackIndex - Track index (null for master track)
 * @param {string} [args.category="regular"] - Track category: "regular", "return", or "master"
 * @param {Array<string>} [args.include] - Array of data to include in the response
 * @param {Array<string>} [args.returnTrackNames] - Array of return track names for sends
 * @returns {object} Track information including clips, devices, routing, and state
 */
export function readTrackGeneric({
  track,
  trackIndex,
  category = "regular",
  include,
  returnTrackNames,
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
    includeMixer,
  } = parseIncludeArray(include, READ_TRACK_DEFAULTS);
  if (!track.exists()) {
    return handleNonExistentTrack(category, trackIndex);
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
  addOptionalBooleanProperties(result, track, canBeArmed);
  // Add mixer properties if requested
  if (includeMixer) {
    Object.assign(result, readMixerProperties(track, returnTrackNames));
  }
  if (groupId) {
    result.groupId = `${groupId}`;
  }
  addCategoryIndex(result, category, trackIndex);
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
  cleanupDeviceChains(result);
  addSlotIndices(result, track, category);
  addStateIfNotDefault(result, track, category);
  addRoutingInfo(
    result,
    track,
    category,
    isGroup,
    canBeArmed,
    includeRoutings,
    includeAvailableRoutings,
  );
  addProducerPalHostInfo(result, isProducerPalHost);
  return result;
}

/**
 * Categorize devices into MIDI effects, instruments, and audio effects
 * @param {Array} devices - Array of Live API device objects
 * @param {boolean} includeDrumChains - Whether to include drum pad chains and return chains
 * @param {boolean} includeRackChains - Whether to include chains in rack devices
 * @returns {object} Object with midiEffects, instrument, and audioEffects arrays
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
/**
 * Removes chains property from a device object
 * @param {object} device - Device object to strip chains from
 * @returns {object} Device object without chains property
 */
function stripChains(device) {
  if (!device || typeof device !== "object") {
    return device;
  }
  const { chains: _chains, ...rest } = device;
  return rest;
}
