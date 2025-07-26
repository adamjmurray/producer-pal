// src/tools/include-params.js

/**
 * All available include options mapped by tool type
 */
const ALL_INCLUDE_OPTIONS = {
  song: [
    "drum-chains",
    "notes",
    "rack-chains",
    "empty-scenes",
    "midi-effects",
    "instrument",
    "audio-effects",
    "routings",
    "session-clips",
    "arrangement-clips",
    "regular-tracks",
    "return-tracks",
    "master-track",
  ],
  track: [
    "drum-chains",
    "notes",
    "rack-chains",
    "midi-effects",
    "instrument",
    "audio-effects",
    "routings",
    "session-clips",
    "arrangement-clips",
  ],
  scene: ["clips", "notes"],
  clip: ["notes"],
};

/**
 * Expand '*' in include array to all available options for the given tool type
 * @param {string[]} includeArray - Array of include options that may contain '*'
 * @param {Object} defaults - Default values to determine tool type from structure
 * @returns {string[]} Expanded array with '*' replaced by all available options
 */
function expandWildcardIncludes(includeArray, defaults) {
  if (!includeArray.includes("*")) {
    return includeArray;
  }

  // Determine tool type from defaults structure to get appropriate options
  let toolType = "song"; // default fallback
  if (defaults.includeRegularTracks !== undefined) {
    toolType = "song";
  } else if (defaults.includeSessionClips !== undefined) {
    toolType = "track";
  } else if (defaults.includeClips !== undefined) {
    toolType = "scene";
  } else if (
    Object.keys(defaults).length === 1 &&
    defaults.includeNotes !== undefined
  ) {
    toolType = "clip";
  }

  const allOptions = ALL_INCLUDE_OPTIONS[toolType] || [];

  // Create set with all non-'*' options plus all available options
  const expandedSet = new Set(includeArray.filter((option) => option !== "*"));
  allOptions.forEach((option) => expandedSet.add(option));

  return Array.from(expandedSet);
}

/**
 * Convert new include array format to legacy boolean parameters, with backward compatibility
 * @param {string[]|Object} includeOrLegacyParams - Array of kebab-case include options OR legacy parameter object
 * @param {Object} defaults - Default values for each parameter
 * @returns {Object} Object with boolean include* properties
 */
export function convertIncludeParams(
  includeOrLegacyParams = [],
  defaults = {},
) {
  // Handle backward compatibility: if we get an object instead of an array,
  // it's the old parameter format
  if (
    typeof includeOrLegacyParams === "object" &&
    !Array.isArray(includeOrLegacyParams)
  ) {
    // Legacy format - merge with defaults
    return {
      includeDrumChains:
        includeOrLegacyParams.includeDrumChains ??
        Boolean(defaults.includeDrumChains),
      includeNotes:
        includeOrLegacyParams.includeNotes ?? Boolean(defaults.includeNotes),
      includeRackChains:
        includeOrLegacyParams.includeRackChains ??
        Boolean(defaults.includeRackChains),
      includeEmptyScenes:
        includeOrLegacyParams.includeEmptyScenes ??
        Boolean(defaults.includeEmptyScenes),
      includeMidiEffects:
        includeOrLegacyParams.includeMidiEffects ??
        Boolean(defaults.includeMidiEffects),
      includeInstrument:
        includeOrLegacyParams.includeInstrument ??
        Boolean(defaults.includeInstrument),
      includeAudioEffects:
        includeOrLegacyParams.includeAudioEffects ??
        Boolean(defaults.includeAudioEffects),
      includeRoutings:
        includeOrLegacyParams.includeRoutings ??
        Boolean(defaults.includeRoutings),
      includeSessionClips:
        includeOrLegacyParams.includeSessionClips ??
        Boolean(defaults.includeSessionClips),
      includeArrangementClips:
        includeOrLegacyParams.includeArrangementClips ??
        Boolean(defaults.includeArrangementClips),
      includeClips:
        includeOrLegacyParams.includeClips ?? Boolean(defaults.includeClips),
      includeRegularTracks:
        includeOrLegacyParams.includeRegularTracks ??
        Boolean(defaults.includeRegularTracks),
      includeReturnTracks:
        includeOrLegacyParams.includeReturnTracks ??
        Boolean(defaults.includeReturnTracks),
      includeMasterTrack:
        includeOrLegacyParams.includeMasterTrack ??
        Boolean(defaults.includeMasterTrack),
    };
  }

  // New array format - expand '*' to all available options
  const expandedIncludes = expandWildcardIncludes(
    includeOrLegacyParams,
    defaults,
  );
  const includeSet = new Set(expandedIncludes);

  // For new array format, always use the provided array (defaults are handled by tool definitions)
  const shouldApplyDefaults = false;

  return {
    includeDrumChains:
      includeSet.has("drum-chains") ||
      (shouldApplyDefaults && Boolean(defaults.includeDrumChains)),
    includeNotes:
      includeSet.has("notes") ||
      (shouldApplyDefaults && Boolean(defaults.includeNotes)),
    includeRackChains:
      includeSet.has("rack-chains") ||
      (shouldApplyDefaults && Boolean(defaults.includeRackChains)),
    includeEmptyScenes:
      includeSet.has("empty-scenes") ||
      (shouldApplyDefaults && Boolean(defaults.includeEmptyScenes)),
    includeMidiEffects:
      includeSet.has("midi-effects") ||
      (shouldApplyDefaults && Boolean(defaults.includeMidiEffects)),
    includeInstrument:
      includeSet.has("instrument") ||
      (shouldApplyDefaults && Boolean(defaults.includeInstrument)),
    includeAudioEffects:
      includeSet.has("audio-effects") ||
      (shouldApplyDefaults && Boolean(defaults.includeAudioEffects)),
    includeRoutings:
      includeSet.has("routings") ||
      (shouldApplyDefaults && Boolean(defaults.includeRoutings)),
    includeSessionClips:
      includeSet.has("session-clips") ||
      (shouldApplyDefaults && Boolean(defaults.includeSessionClips)),
    includeArrangementClips:
      includeSet.has("arrangement-clips") ||
      (shouldApplyDefaults && Boolean(defaults.includeArrangementClips)),
    includeClips:
      includeSet.has("clips") ||
      (shouldApplyDefaults && Boolean(defaults.includeClips)),
    includeRegularTracks:
      includeSet.has("regular-tracks") ||
      (shouldApplyDefaults && Boolean(defaults.includeRegularTracks)),
    includeReturnTracks:
      includeSet.has("return-tracks") ||
      (shouldApplyDefaults && Boolean(defaults.includeReturnTracks)),
    includeMasterTrack:
      includeSet.has("master-track") ||
      (shouldApplyDefaults && Boolean(defaults.includeMasterTrack)),
  };
}

/**
 * Default include parameters for read-song tool
 */
export const READ_SONG_DEFAULTS = {
  includeDrumChains: false,
  includeNotes: false,
  includeRackChains: true,
  includeEmptyScenes: false,
  includeMidiEffects: false,
  includeInstrument: true,
  includeAudioEffects: false,
  includeRoutings: false,
  includeSessionClips: false,
  includeArrangementClips: false,
  includeRegularTracks: true,
  includeReturnTracks: false,
  includeMasterTrack: false,
};

/**
 * Default include parameters for read-track tool
 */
export const READ_TRACK_DEFAULTS = {
  includeDrumChains: false,
  includeNotes: true,
  includeRackChains: true,
  includeMidiEffects: false,
  includeInstrument: true,
  includeAudioEffects: false,
  includeRoutings: false,
  includeSessionClips: true,
  includeArrangementClips: true,
};

/**
 * Default include parameters for read-scene tool
 */
export const READ_SCENE_DEFAULTS = {
  includeClips: false,
  includeNotes: false,
};

/**
 * Default include parameters for read-clip tool
 */
export const READ_CLIP_DEFAULTS = {
  includeNotes: true,
};
