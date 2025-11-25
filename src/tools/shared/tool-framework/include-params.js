// String constants for include options
const DRUM_CHAINS = "drum-chains";
const DRUM_MAPS = "drum-maps";
const CLIP_NOTES = "clip-notes";
const RACK_CHAINS = "rack-chains";
const MIDI_EFFECTS = "midi-effects";
const INSTRUMENTS = "instruments";
const AUDIO_EFFECTS = "audio-effects";
const SESSION_CLIPS = "session-clips";
const ARRANGEMENT_CLIPS = "arrangement-clips";
const REGULAR_TRACKS = "regular-tracks";
const RETURN_TRACKS = "return-tracks";
const MASTER_TRACK = "master-track";
const WARP_MARKERS = "warp-markers";
const AVAILABLE_ROUTINGS = "available-routings";
const COLOR = "color";
const CLIPS = "clips";
const MIXER = "mixer";

/**
 * All available include options mapped by tool type
 */
const ALL_INCLUDE_OPTIONS = {
  song: [
    DRUM_CHAINS,
    DRUM_MAPS,
    CLIP_NOTES,
    RACK_CHAINS,
    "scenes",
    MIDI_EFFECTS,
    INSTRUMENTS,
    AUDIO_EFFECTS,
    "routings",
    SESSION_CLIPS,
    ARRANGEMENT_CLIPS,
    REGULAR_TRACKS,
    RETURN_TRACKS,
    MASTER_TRACK,
    "all-tracks",
    "all-devices",
    "all-clips",
    COLOR,
    WARP_MARKERS,
    MIXER,
  ],
  track: [
    DRUM_CHAINS,
    DRUM_MAPS,
    CLIP_NOTES,
    RACK_CHAINS,
    MIDI_EFFECTS,
    INSTRUMENTS,
    AUDIO_EFFECTS,
    "routings",
    AVAILABLE_ROUTINGS,
    SESSION_CLIPS,
    ARRANGEMENT_CLIPS,
    "all-devices",
    "all-routings",
    "all-clips",
    COLOR,
    WARP_MARKERS,
    MIXER,
  ],
  scene: [CLIPS, CLIP_NOTES, COLOR, WARP_MARKERS],
  clip: [CLIP_NOTES, COLOR, WARP_MARKERS],
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
 * Parse include array format and return boolean flags for each option
 * @param {string[]} includeArray - Array of kebab-case include options
 * @param {object} defaults - Default values for each parameter
 * @returns {object} Object with boolean include* properties
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
      includeWarpMarkers: Boolean(defaults.includeWarpMarkers),
      includeMixer: Boolean(defaults.includeMixer),
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
      includeWarpMarkers: false,
      includeMixer: false,
    };
  }

  const result = {
    includeDrumChains: includeSet.has(DRUM_CHAINS),
    includeDrumMaps: includeSet.has(DRUM_MAPS),
    includeClipNotes: includeSet.has(CLIP_NOTES),
    includeRackChains: includeSet.has(RACK_CHAINS),
    includeScenes: hasScenes,
    includeMidiEffects: includeSet.has(MIDI_EFFECTS),
    includeInstruments: includeSet.has(INSTRUMENTS),
    includeAudioEffects: includeSet.has(AUDIO_EFFECTS),
    includeRoutings: includeSet.has("routings"),
    includeAvailableRoutings: includeSet.has(AVAILABLE_ROUTINGS),
    includeSessionClips: includeSet.has(SESSION_CLIPS),
    includeArrangementClips: includeSet.has(ARRANGEMENT_CLIPS),
    includeClips: includeSet.has(CLIPS),
    includeRegularTracks: includeSet.has(REGULAR_TRACKS),
    includeReturnTracks: includeSet.has(RETURN_TRACKS),
    includeMasterTrack: includeSet.has(MASTER_TRACK),
    includeColor: includeSet.has(COLOR),
    includeWarpMarkers: includeSet.has(WARP_MARKERS),
    includeMixer: includeSet.has(MIXER),
  };
  return result;
}

/**
 * Convert include flags back to an array format
 * @param {object} includeFlags - Object with boolean include* properties
 * @returns {string[]} Array of include options
 */
export function includeArrayFromFlags(includeFlags) {
  const includes = [];

  if (includeFlags.includeDrumChains) {
    includes.push(DRUM_CHAINS);
  }
  if (includeFlags.includeDrumMaps) {
    includes.push(DRUM_MAPS);
  }
  if (includeFlags.includeClipNotes) {
    includes.push(CLIP_NOTES);
  }
  if (includeFlags.includeRackChains) {
    includes.push(RACK_CHAINS);
  }
  if (includeFlags.includeScenes) {
    includes.push("scenes");
  }
  if (includeFlags.includeMidiEffects) {
    includes.push(MIDI_EFFECTS);
  }
  if (includeFlags.includeInstruments) {
    includes.push(INSTRUMENTS);
  }
  if (includeFlags.includeAudioEffects) {
    includes.push(AUDIO_EFFECTS);
  }
  if (includeFlags.includeRoutings) {
    includes.push("routings");
  }
  if (includeFlags.includeAvailableRoutings) {
    includes.push(AVAILABLE_ROUTINGS);
  }
  if (includeFlags.includeSessionClips) {
    includes.push(SESSION_CLIPS);
  }
  if (includeFlags.includeArrangementClips) {
    includes.push(ARRANGEMENT_CLIPS);
  }
  if (includeFlags.includeClips) {
    includes.push(CLIPS);
  }
  if (includeFlags.includeRegularTracks) {
    includes.push(REGULAR_TRACKS);
  }
  if (includeFlags.includeReturnTracks) {
    includes.push(RETURN_TRACKS);
  }
  if (includeFlags.includeMasterTrack) {
    includes.push(MASTER_TRACK);
  }
  if (includeFlags.includeColor) {
    includes.push(COLOR);
  }
  if (includeFlags.includeWarpMarkers) {
    includes.push(WARP_MARKERS);
  }
  if (includeFlags.includeMixer) {
    includes.push(MIXER);
  }

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
  includeWarpMarkers: false,
  includeMixer: false,
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
  includeWarpMarkers: false,
  includeMixer: false,
};

/**
 * Default include parameters for read-scene tool
 */
export const READ_SCENE_DEFAULTS = {
  includeClips: false,
  includeClipNotes: false,
  includeColor: false,
  includeWarpMarkers: false,
};

/**
 * Default include parameters for read-clip tool
 */
export const READ_CLIP_DEFAULTS = {
  includeClipNotes: true,
  includeColor: false,
  includeWarpMarkers: false,
};

/**
 * Expand shortcuts and '*' in include array to concrete options
 * @param {string[]} includeArray - Array of include options that may contain '*' or shortcuts
 * @param {object} defaults - Default values to determine tool type from structure
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
  let toolType;
  if (
    Object.keys(defaults).length === 1 &&
    defaults.includeClipNotes !== undefined
  ) {
    toolType = "clip";
  } else if (defaults.includeClips !== undefined) {
    toolType = "scene";
  } else if (defaults.includeRegularTracks !== undefined) {
    toolType = "song";
  } else if (defaults.includeSessionClips !== undefined) {
    toolType = "track";
  } else {
    toolType = "song"; // fallback
  }

  const allOptions = ALL_INCLUDE_OPTIONS[toolType] || [];

  // Create set with all non-'*' options plus all available options
  const expandedSet = new Set(expandedArray.filter((option) => option !== "*"));
  allOptions.forEach((option) => expandedSet.add(option));

  return Array.from(expandedSet);
}
