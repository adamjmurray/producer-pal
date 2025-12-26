// String constants for include options
const DRUM_PADS = "drum-pads";
const DRUM_MAPS = "drum-maps";
const CLIP_NOTES = "clip-notes";
const CHAINS = "chains";
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
const LOCATORS = "locators";

/**
 * All available include options mapped by tool type
 */
const ALL_INCLUDE_OPTIONS = {
  song: [
    DRUM_PADS,
    DRUM_MAPS,
    CLIP_NOTES,
    CHAINS,
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
    LOCATORS,
  ],
  track: [
    DRUM_PADS,
    DRUM_MAPS,
    CLIP_NOTES,
    CHAINS,
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
      includeDrumPads: Boolean(defaults.includeDrumPads),
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
      includeLocators: Boolean(defaults.includeLocators),
    };
  }

  // Expand shortcuts and '*' to concrete options
  const expandedIncludes = expandWildcardIncludes(includeArray, defaults);
  const includeSet = new Set(expandedIncludes);

  const hasScenes = includeSet.has("scenes");

  // If an empty array was explicitly provided, return all false
  if (includeArray.length === 0) {
    return {
      includeDrumPads: false,
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
      includeLocators: false,
    };
  }

  const result = {
    includeDrumPads: includeSet.has(DRUM_PADS),
    includeDrumMaps: includeSet.has(DRUM_MAPS),
    includeClipNotes: includeSet.has(CLIP_NOTES),
    includeRackChains: includeSet.has(CHAINS),
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
    includeLocators: includeSet.has(LOCATORS),
  };

  return result;
}

/**
 * Mapping of flag properties to their include option strings
 */
const FLAG_TO_OPTION = [
  ["includeDrumPads", DRUM_PADS],
  ["includeDrumMaps", DRUM_MAPS],
  ["includeClipNotes", CLIP_NOTES],
  ["includeRackChains", CHAINS],
  ["includeScenes", "scenes"],
  ["includeMidiEffects", MIDI_EFFECTS],
  ["includeInstruments", INSTRUMENTS],
  ["includeAudioEffects", AUDIO_EFFECTS],
  ["includeRoutings", "routings"],
  ["includeAvailableRoutings", AVAILABLE_ROUTINGS],
  ["includeSessionClips", SESSION_CLIPS],
  ["includeArrangementClips", ARRANGEMENT_CLIPS],
  ["includeClips", CLIPS],
  ["includeRegularTracks", REGULAR_TRACKS],
  ["includeReturnTracks", RETURN_TRACKS],
  ["includeMasterTrack", MASTER_TRACK],
  ["includeColor", COLOR],
  ["includeWarpMarkers", WARP_MARKERS],
  ["includeMixer", MIXER],
  ["includeLocators", LOCATORS],
];

/**
 * Convert include flags back to an array format
 * @param {object} includeFlags - Object with boolean include* properties
 * @returns {string[]} Array of include options
 */
export function includeArrayFromFlags(includeFlags) {
  return FLAG_TO_OPTION.filter(([flag]) => includeFlags[flag]).map(
    ([, option]) => option,
  );
}

/**
 * Default include parameters for read-live-set tool
 */
export const READ_SONG_DEFAULTS = {
  includeDrumPads: false,
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
  includeLocators: false,
};

/**
 * Default include parameters for read-track tool
 */
export const READ_TRACK_DEFAULTS = {
  includeDrumPads: false,
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
