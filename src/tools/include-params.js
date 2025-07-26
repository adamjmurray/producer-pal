// src/tools/include-params.js

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
    };
  }

  // New array format
  const includeSet = new Set(includeOrLegacyParams);

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
