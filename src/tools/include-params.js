// src/tools/include-params.js

/**
 * All available include options mapped by tool type
 */
const ALL_INCLUDE_OPTIONS = {
  song: [
    "drum-chains",
    "notes",
    "rack-chains",
    "scenes",
    "midi-effects",
    "instrument",
    "audio-effects",
    "routings",
    "session-clips",
    "arrangement-clips",
    "regular-tracks",
    "return-tracks",
    "master-track",
    "all-tracks",
    "all-devices",
  ],
  track: [
    "drum-chains",
    "notes",
    "rack-chains",
    "midi-effects",
    "instrument",
    "audio-effects",
    "routings",
    "available-routings",
    "session-clips",
    "arrangement-clips",
    "all-devices",
    "all-routings",
  ],
  scene: ["clips", "notes"],
  clip: ["notes"],
};

/**
 * Shortcut mappings for include options
 */
const SHORTCUT_MAPPINGS = {
  "all-tracks": ["regular-tracks", "return-tracks", "master-track"],
  "all-devices": ["midi-effects", "instrument", "audio-effects"],
  "all-routings": ["routings", "available-routings"],
};

/**
 * Expand shortcuts and '*' in include array to concrete options
 * @param {string[]} includeArray - Array of include options that may contain '*' or shortcuts
 * @param {Object} defaults - Default values to determine tool type from structure
 * @returns {string[]} Expanded array with shortcuts and '*' replaced by concrete options
 */
function expandWildcardIncludes(includeArray, defaults) {
  // First expand shortcuts
  let expandedArray = [];
  for (const option of includeArray) {
    if (SHORTCUT_MAPPINGS[option]) {
      expandedArray.push(...SHORTCUT_MAPPINGS[option]);
    } else {
      expandedArray.push(option);
    }
  }

  // Then handle '*' expansion
  if (!expandedArray.includes("*")) {
    return expandedArray;
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
  const expandedSet = new Set(expandedArray.filter((option) => option !== "*"));
  allOptions.forEach((option) => expandedSet.add(option));

  return Array.from(expandedSet);
}

/**
 * Parse include array format and return boolean flags for each option
 * @param {string[]} includeArray - Array of kebab-case include options
 * @param {Object} defaults - Default values for each parameter
 * @returns {Object} Object with boolean include* properties
 */
export function parseIncludeArray(includeArray, defaults = {}) {
  // If no include array is provided (undefined), use defaults
  if (includeArray === undefined) {
    return {
      includeDrumChains: Boolean(defaults.includeDrumChains),
      includeNotes: Boolean(defaults.includeNotes),
      includeRackChains: Boolean(defaults.includeRackChains),
      includeScenes: Boolean(defaults.includeScenes),
      includeMidiEffects: Boolean(defaults.includeMidiEffects),
      includeInstrument: Boolean(defaults.includeInstrument),
      includeAudioEffects: Boolean(defaults.includeAudioEffects),
      includeRoutings: Boolean(defaults.includeRoutings),
      includeAvailableRoutings: Boolean(defaults.includeAvailableRoutings),
      includeSessionClips: Boolean(defaults.includeSessionClips),
      includeArrangementClips: Boolean(defaults.includeArrangementClips),
      includeClips: Boolean(defaults.includeClips),
      includeRegularTracks: Boolean(defaults.includeRegularTracks),
      includeReturnTracks: Boolean(defaults.includeReturnTracks),
      includeMasterTrack: Boolean(defaults.includeMasterTrack),
    };
  }

  // Expand shortcuts and '*' to concrete options
  const expandedIncludes = expandWildcardIncludes(includeArray, defaults);
  const includeSet = new Set(expandedIncludes);

  const hasScenes = includeSet.has("scenes");

  // If an empty array was explicitly provided, return all false
  if (includeArray.length === 0) {
    return {
      includeDrumChains: false,
      includeNotes: false,
      includeRackChains: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstrument: false,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeRegularTracks: false,
      includeReturnTracks: false,
      includeMasterTrack: false,
    };
  }

  const result = {
    includeDrumChains: includeSet.has("drum-chains"),
    includeNotes: includeSet.has("notes"),
    includeRackChains: includeSet.has("rack-chains"),
    includeScenes: hasScenes,
    includeMidiEffects: includeSet.has("midi-effects"),
    includeInstrument: includeSet.has("instrument"),
    includeAudioEffects: includeSet.has("audio-effects"),
    includeRoutings: includeSet.has("routings"),
    includeAvailableRoutings: includeSet.has("available-routings"),
    includeSessionClips: includeSet.has("session-clips"),
    includeArrangementClips: includeSet.has("arrangement-clips"),
    includeClips: includeSet.has("clips"),
    includeRegularTracks: includeSet.has("regular-tracks"),
    includeReturnTracks: includeSet.has("return-tracks"),
    includeMasterTrack: includeSet.has("master-track"),
  };
  return result;
}

/**
 * Convert include flags back to an array format
 * @param {Object} includeFlags - Object with boolean include* properties
 * @returns {string[]} Array of include options
 */
export function includeArrayFromFlags(includeFlags) {
  const includes = [];

  if (includeFlags.includeDrumChains) includes.push("drum-chains");
  if (includeFlags.includeNotes) includes.push("notes");
  if (includeFlags.includeRackChains) includes.push("rack-chains");
  if (includeFlags.includeScenes) includes.push("scenes");
  if (includeFlags.includeMidiEffects) includes.push("midi-effects");
  if (includeFlags.includeInstrument) includes.push("instrument");
  if (includeFlags.includeAudioEffects) includes.push("audio-effects");
  if (includeFlags.includeRoutings) includes.push("routings");
  if (includeFlags.includeAvailableRoutings)
    includes.push("available-routings");
  if (includeFlags.includeSessionClips) includes.push("session-clips");
  if (includeFlags.includeArrangementClips) includes.push("arrangement-clips");
  if (includeFlags.includeClips) includes.push("clips");
  if (includeFlags.includeRegularTracks) includes.push("regular-tracks");
  if (includeFlags.includeReturnTracks) includes.push("return-tracks");
  if (includeFlags.includeMasterTrack) includes.push("master-track");

  return includes;
}

/**
 * Default include parameters for read-song tool
 */
export const READ_SONG_DEFAULTS = {
  includeDrumChains: false,
  includeNotes: false,
  includeRackChains: true,
  includeScenes: false,
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
  includeAvailableRoutings: false,
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
