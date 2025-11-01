/**
 * All available include options mapped by tool type
 */
const ALL_INCLUDE_OPTIONS = {
  song: [
    "drum-chains",
    "drum-maps",
    "clip-notes",
    "rack-chains",
    "scenes",
    "midi-effects",
    "instruments",
    "audio-effects",
    "routings",
    "session-clips",
    "arrangement-clips",
    "regular-tracks",
    "return-tracks",
    "master-track",
    "all-tracks",
    "all-devices",
    "all-clips",
    "color",
  ],
  track: [
    "drum-chains",
    "drum-maps",
    "clip-notes",
    "rack-chains",
    "midi-effects",
    "instruments",
    "audio-effects",
    "routings",
    "available-routings",
    "session-clips",
    "arrangement-clips",
    "all-devices",
    "all-routings",
    "all-clips",
    "color",
  ],
  scene: ["clips", "clip-notes", "color"],
  clip: ["clip-notes", "color"],
};

/**
 * Shortcut mappings for include options
 */
const SHORTCUT_MAPPINGS = {
  "all-tracks": ["regular-tracks", "return-tracks", "master-track"],
  "all-devices": ["midi-effects", "instruments", "audio-effects"],
  "all-routings": ["routings", "available-routings"],
  "all-clips": ["session-clips", "arrangement-clips"],
};

/**
 * Expand shortcuts and '*' in include array to concrete options
 * @param {string[]} includeArray - Array of include options that may contain '*' or shortcuts
 * @param {Object} defaults - Default values to determine tool type from structure
 * @returns {string[]} Expanded array with shortcuts and '*' replaced by concrete options
 */
function expandWildcardIncludes(includeArray, defaults) {
  // First expand shortcuts
  const expandedArray = [];
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
    defaults.includeClipNotes !== undefined
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
      includeDrumMaps: Boolean(defaults.includeDrumMaps),
      includeClipNotes: Boolean(defaults.includeClipNotes),
      includeRackChains: Boolean(defaults.includeRackChains),
      includeScenes: Boolean(defaults.includeScenes),
      includeMidiEffects: Boolean(defaults.includeMidiEffects),
      includeInstruments: Boolean(defaults.includeInstruments),
      includeAudioEffects: Boolean(defaults.includeAudioEffects),
      includeRoutings: Boolean(defaults.includeRoutings),
      includeAvailableRoutings: Boolean(defaults.includeAvailableRoutings),
      includeSessionClips: Boolean(defaults.includeSessionClips),
      includeArrangementClips: Boolean(defaults.includeArrangementClips),
      includeClips: Boolean(defaults.includeClips),
      includeRegularTracks: Boolean(defaults.includeRegularTracks),
      includeReturnTracks: Boolean(defaults.includeReturnTracks),
      includeMasterTrack: Boolean(defaults.includeMasterTrack),
      includeColor: Boolean(defaults.includeColor),
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
      includeDrumMaps: false,
      includeClipNotes: false,
      includeRackChains: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstruments: false,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeRegularTracks: false,
      includeReturnTracks: false,
      includeMasterTrack: false,
      includeColor: false,
    };
  }

  const result = {
    includeDrumChains: includeSet.has("drum-chains"),
    includeDrumMaps: includeSet.has("drum-maps"),
    includeClipNotes: includeSet.has("clip-notes"),
    includeRackChains: includeSet.has("rack-chains"),
    includeScenes: hasScenes,
    includeMidiEffects: includeSet.has("midi-effects"),
    includeInstruments: includeSet.has("instruments"),
    includeAudioEffects: includeSet.has("audio-effects"),
    includeRoutings: includeSet.has("routings"),
    includeAvailableRoutings: includeSet.has("available-routings"),
    includeSessionClips: includeSet.has("session-clips"),
    includeArrangementClips: includeSet.has("arrangement-clips"),
    includeClips: includeSet.has("clips"),
    includeRegularTracks: includeSet.has("regular-tracks"),
    includeReturnTracks: includeSet.has("return-tracks"),
    includeMasterTrack: includeSet.has("master-track"),
    includeColor: includeSet.has("color"),
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
  if (includeFlags.includeDrumMaps) includes.push("drum-maps");
  if (includeFlags.includeClipNotes) includes.push("clip-notes");
  if (includeFlags.includeRackChains) includes.push("rack-chains");
  if (includeFlags.includeScenes) includes.push("scenes");
  if (includeFlags.includeMidiEffects) includes.push("midi-effects");
  if (includeFlags.includeInstruments) includes.push("instruments");
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
  if (includeFlags.includeColor) includes.push("color");

  return includes;
}

/**
 * Default include parameters for read-live-set tool
 */
export const READ_SONG_DEFAULTS = {
  includeDrumChains: false,
  includeDrumMaps: true,
  includeClipNotes: false,
  includeRackChains: false,
  includeScenes: false,
  includeMidiEffects: false,
  includeInstruments: true,
  includeAudioEffects: false,
  includeRoutings: false,
  includeSessionClips: false,
  includeArrangementClips: false,
  includeRegularTracks: true,
  includeReturnTracks: false,
  includeMasterTrack: false,
  includeColor: false,
};

/**
 * Default include parameters for read-track tool
 */
export const READ_TRACK_DEFAULTS = {
  includeDrumChains: false,
  includeDrumMaps: true,
  includeClipNotes: true,
  includeRackChains: false,
  includeMidiEffects: false,
  includeInstruments: true,
  includeAudioEffects: false,
  includeRoutings: false,
  includeAvailableRoutings: false,
  includeSessionClips: true,
  includeArrangementClips: true,
  includeColor: false,
};

/**
 * Default include parameters for read-scene tool
 */
export const READ_SCENE_DEFAULTS = {
  includeClips: false,
  includeClipNotes: false,
  includeColor: false,
};

/**
 * Default include parameters for read-clip tool
 */
export const READ_CLIP_DEFAULTS = {
  includeClipNotes: true,
  includeColor: false,
};
