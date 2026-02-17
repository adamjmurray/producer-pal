// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

// String constants for include options
const DRUM_MAPS = "drum-maps";
const CLIP_NOTES = "clip-notes";
const MIDI_EFFECTS = "midi-effects";
const INSTRUMENTS = "instruments";
const AUDIO_EFFECTS = "audio-effects";
const SESSION_CLIPS = "session-clips";
const ARRANGEMENT_CLIPS = "arrangement-clips";
const TRACKS = "tracks";
const SAMPLE = "sample";
const TIMING = "timing";
const WARP = "warp";
const DEVICES = "devices";
const AVAILABLE_ROUTINGS = "available-routings";
const COLOR = "color";
const CLIPS = "clips";
const MIXER = "mixer";
const LOCATORS = "locators";

/**
 * All available include options mapped by tool type
 */
const ALL_INCLUDE_OPTIONS: Record<string, string[]> = {
  song: ["scenes", "routings", TRACKS, COLOR, MIXER, LOCATORS],
  track: [
    SESSION_CLIPS,
    ARRANGEMENT_CLIPS,
    CLIP_NOTES,
    TIMING,
    SAMPLE,
    DEVICES,
    DRUM_MAPS,
    "routings",
    AVAILABLE_ROUTINGS,
    MIXER,
    COLOR,
  ],
  scene: [CLIPS, CLIP_NOTES, SAMPLE, COLOR, TIMING],
  clip: [CLIP_NOTES, SAMPLE, COLOR, TIMING, WARP],
};

/**
 * Shortcut mappings for include options
 */
const SHORTCUT_MAPPINGS: Record<string, string[]> = {
  "all-devices": ["midi-effects", "instruments", "audio-effects"],
  "all-routings": ["routings", "available-routings"],
  "all-clips": ["session-clips", "arrangement-clips"],
};

export interface IncludeFlags {
  includeDrumMaps: boolean;
  includeClipNotes: boolean;
  includeScenes: boolean;
  includeMidiEffects: boolean;
  includeInstruments: boolean;
  includeAudioEffects: boolean;
  includeRoutings: boolean;
  includeAvailableRoutings: boolean;
  includeSessionClips: boolean;
  includeArrangementClips: boolean;
  includeClips: boolean;
  includeTracks: boolean;
  includeDevices: boolean;
  includeColor: boolean;
  includeSample: boolean;
  includeTiming: boolean;
  includeWarp: boolean;
  includeMixer: boolean;
  includeLocators: boolean;
}

/**
 * Parse include array format and return boolean flags for each option
 * @param includeArray - Array of kebab-case include options
 * @param defaults - Default values for each parameter
 * @returns Object with boolean include* properties
 */
export function parseIncludeArray(
  includeArray: string[] | undefined,
  defaults: Partial<IncludeFlags> = {},
): IncludeFlags {
  // If no include array is provided (undefined), use defaults
  if (includeArray === undefined) {
    return {
      includeDrumMaps: Boolean(defaults.includeDrumMaps),
      includeClipNotes: Boolean(defaults.includeClipNotes),
      includeScenes: Boolean(defaults.includeScenes),
      includeMidiEffects: Boolean(defaults.includeMidiEffects),
      includeInstruments: Boolean(defaults.includeInstruments),
      includeAudioEffects: Boolean(defaults.includeAudioEffects),
      includeDevices: Boolean(defaults.includeDevices),
      includeRoutings: Boolean(defaults.includeRoutings),
      includeAvailableRoutings: Boolean(defaults.includeAvailableRoutings),
      includeSessionClips: Boolean(defaults.includeSessionClips),
      includeArrangementClips: Boolean(defaults.includeArrangementClips),
      includeClips: Boolean(defaults.includeClips),
      includeTracks: Boolean(defaults.includeTracks),
      includeSample: Boolean(defaults.includeSample),
      includeColor: Boolean(defaults.includeColor),
      includeTiming: Boolean(defaults.includeTiming),
      includeWarp: Boolean(defaults.includeWarp),
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
      includeDrumMaps: false,
      includeClipNotes: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstruments: false,
      includeAudioEffects: false,
      includeDevices: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeTracks: false,
      includeSample: false,
      includeColor: false,
      includeTiming: false,
      includeWarp: false,
      includeMixer: false,
      includeLocators: false,
    };
  }

  return {
    includeDrumMaps: includeSet.has(DRUM_MAPS),
    includeClipNotes: includeSet.has(CLIP_NOTES),
    includeScenes: hasScenes,
    includeMidiEffects: includeSet.has(MIDI_EFFECTS),
    includeInstruments: includeSet.has(INSTRUMENTS),
    includeAudioEffects: includeSet.has(AUDIO_EFFECTS),
    includeDevices: includeSet.has(DEVICES),
    includeRoutings: includeSet.has("routings"),
    includeAvailableRoutings: includeSet.has(AVAILABLE_ROUTINGS),
    includeSessionClips: includeSet.has(SESSION_CLIPS),
    includeArrangementClips: includeSet.has(ARRANGEMENT_CLIPS),
    includeClips: includeSet.has(CLIPS),
    includeTracks: includeSet.has(TRACKS),
    includeSample: includeSet.has(SAMPLE),
    includeColor: includeSet.has(COLOR),
    includeTiming: includeSet.has(TIMING),
    includeWarp: includeSet.has(WARP),
    includeMixer: includeSet.has(MIXER),
    includeLocators: includeSet.has(LOCATORS),
  };
}

/**
 * Mapping of flag properties to their include option strings
 */
const FLAG_TO_OPTION: [keyof IncludeFlags, string][] = [
  ["includeDrumMaps", DRUM_MAPS],
  ["includeClipNotes", CLIP_NOTES],
  ["includeScenes", "scenes"],
  ["includeMidiEffects", MIDI_EFFECTS],
  ["includeInstruments", INSTRUMENTS],
  ["includeAudioEffects", AUDIO_EFFECTS],
  ["includeDevices", DEVICES],
  ["includeRoutings", "routings"],
  ["includeAvailableRoutings", AVAILABLE_ROUTINGS],
  ["includeSessionClips", SESSION_CLIPS],
  ["includeArrangementClips", ARRANGEMENT_CLIPS],
  ["includeClips", CLIPS],
  ["includeTracks", TRACKS],
  ["includeSample", SAMPLE],
  ["includeColor", COLOR],
  ["includeTiming", TIMING],
  ["includeWarp", WARP],
  ["includeMixer", MIXER],
  ["includeLocators", LOCATORS],
];

/**
 * Convert include flags back to an array format
 * @param includeFlags - Object with boolean include* properties
 * @returns Array of include options
 */
export function includeArrayFromFlags(
  includeFlags: Partial<IncludeFlags>,
): string[] {
  const flagsRecord = includeFlags as Record<string, boolean | undefined>;

  return FLAG_TO_OPTION.filter(([flag]) => flagsRecord[flag]).map(
    ([, option]) => option,
  );
}

/**
 * Default include parameters for read-live-set tool
 */
export const READ_SONG_DEFAULTS: Partial<IncludeFlags> = {
  includeScenes: false,
  includeRoutings: false,
  includeTracks: false,
  includeColor: false,
  includeMixer: false,
  includeLocators: false,
};

/**
 * Default include parameters for read-track tool
 */
export const READ_TRACK_DEFAULTS: Partial<IncludeFlags> = {
  includeDrumMaps: false,
  includeClipNotes: false,
  includeDevices: false,
  includeMidiEffects: false,
  includeInstruments: false,
  includeAudioEffects: false,
  includeRoutings: false,
  includeAvailableRoutings: false,
  includeSessionClips: false,
  includeArrangementClips: false,
  includeSample: false,
  includeColor: false,
  includeTiming: false,
  includeWarp: false,
  includeMixer: false,
};

/**
 * Default include parameters for read-scene tool
 */
export const READ_SCENE_DEFAULTS: Partial<IncludeFlags> = {
  includeClips: false,
  includeClipNotes: false,
  includeSample: false,
  includeColor: false,
  includeTiming: false,
};

/**
 * Default include parameters for read-clip tool
 */
export const READ_CLIP_DEFAULTS: Partial<IncludeFlags> = {
  includeClipNotes: false,
  includeSample: false,
  includeColor: false,
  includeTiming: false,
  includeWarp: false,
};

/**
 * Expand shortcuts and '*' in include array to concrete options
 * @param includeArray - Array of include options that may contain '*' or shortcuts
 * @param defaults - Default values to determine tool type from structure
 * @returns Expanded array with shortcuts and '*' replaced by concrete options
 */
function expandWildcardIncludes(
  includeArray: string[],
  defaults: Partial<IncludeFlags>,
): string[] {
  // First expand shortcuts
  const expandedArray: string[] = [];

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
  let toolType: string;

  if (defaults.includeTracks !== undefined) {
    toolType = "song";
  } else if (defaults.includeSessionClips !== undefined) {
    toolType = "track";
  } else if (defaults.includeClips !== undefined) {
    toolType = "scene";
  } else if (defaults.includeClipNotes !== undefined) {
    toolType = "clip";
  } else {
    toolType = "song"; // fallback
  }

  const allOptions = ALL_INCLUDE_OPTIONS[toolType] ?? [];

  // Create set with all non-'*' options plus all available options
  const expandedSet = new Set(expandedArray.filter((option) => option !== "*"));

  for (const option of allOptions) expandedSet.add(option);

  return Array.from(expandedSet);
}
