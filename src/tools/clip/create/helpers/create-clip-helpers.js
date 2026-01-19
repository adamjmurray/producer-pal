import * as console from "#src/shared/v8-max-console.js";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.js";
import { buildIndexedName } from "#src/tools/shared/utils.js";
import {
  parseSceneIndexList as parseSceneIndexListBase,
  parseArrangementStartList,
} from "#src/tools/shared/validation/position-parsing.js";
import {
  createAudioArrangementClip,
  createAudioSessionClip,
} from "./create-clip-audio-helpers.js";
import {
  buildClipProperties,
  buildClipResult,
} from "./create-clip-result-helpers.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.js";
import { prepareSessionClipSlot } from "#src/tools/clip/helpers/clip-result-helpers.js";

/** @typedef {import('#src/tools/clip/helpers/clip-result-helpers.js').MidiNote} MidiNote */

// Re-export for use by create-clip.js
export { parseArrangementStartList };

/**
 * Parses scene indices with createClip-specific error message
 * @param {string | null} input - Comma-separated scene indices
 * @returns {number[]} - Array of scene indices
 */
export function parseSceneIndexList(input) {
  try {
    return parseSceneIndexListBase(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`createClip failed: ${message}`);
  }
}

/**
 * Builds a clip name based on count and iteration index
 * @param {string | null} name - Base clip name
 * @param {number} count - Total number of clips being created
 * @param {number} i - Current iteration index (0-based)
 * @returns {string|undefined} - Generated clip name
 */
export function buildClipName(name, count, i) {
  return buildIndexedName(name, count, i);
}

/**
 * @typedef {object} TimingParameters
 * @property {number | null} arrangementStartBeats
 * @property {number | null} startBeats
 * @property {number | null} firstStartBeats
 * @property {number | null} endBeats
 */

/**
 * Converts bar|beat timing parameters to Ableton beats
 * @param {string | null} arrangementStart - Arrangement start position in bar|beat format
 * @param {string | null} start - Loop start position in bar|beat format
 * @param {string | null} firstStart - First playback start position in bar|beat format
 * @param {string | null} length - Clip length in bar|beat duration format
 * @param {boolean | null} looping - Whether the clip is looping
 * @param {number} timeSigNumerator - Clip time signature numerator
 * @param {number} timeSigDenominator - Clip time signature denominator
 * @param {number} songTimeSigNumerator - Song time signature numerator
 * @param {number} songTimeSigDenominator - Song time signature denominator
 * @returns {TimingParameters} - Converted timing parameters in beats
 */
export function convertTimingParameters(
  arrangementStart,
  start,
  firstStart,
  length,
  looping,
  timeSigNumerator,
  timeSigDenominator,
  songTimeSigNumerator,
  songTimeSigDenominator,
) {
  // Convert bar|beat timing parameters to Ableton beats
  const arrangementStartBeats =
    arrangementStart != null
      ? barBeatToAbletonBeats(
          arrangementStart,
          songTimeSigNumerator,
          songTimeSigDenominator,
        )
      : null;
  const startBeats =
    start != null
      ? barBeatToAbletonBeats(start, timeSigNumerator, timeSigDenominator)
      : null;
  const firstStartBeats =
    firstStart != null
      ? barBeatToAbletonBeats(firstStart, timeSigNumerator, timeSigDenominator)
      : null;

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && looping === false) {
    console.error(
      "Warning: firstStart parameter ignored for non-looping clips",
    );
  }

  // Convert length parameter to end position
  let endBeats = null;

  if (length != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );
    const startOffsetBeats = startBeats || 0;

    endBeats = startOffsetBeats + lengthBeats;
  }

  return { arrangementStartBeats, startBeats, firstStartBeats, endBeats };
}

/**
 * @typedef {object} SessionClipResult
 * @property {LiveAPI} clip
 * @property {number} sceneIndex
 */

/**
 * Creates a session clip in a clip slot, auto-creating scenes if needed
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} sceneIndex - Target scene index (0-based)
 * @param {number} clipLength - Clip length in beats
 * @param {LiveAPI} liveSet - LiveAPI live_set object
 * @param {number} maxAutoCreatedScenes - Maximum scenes allowed
 * @returns {SessionClipResult} - Object with clip and sceneIndex
 */
function createSessionClip(
  trackIndex,
  sceneIndex,
  clipLength,
  liveSet,
  maxAutoCreatedScenes,
) {
  const clipSlot = prepareSessionClipSlot(
    trackIndex,
    sceneIndex,
    liveSet,
    maxAutoCreatedScenes,
  );

  clipSlot.call("create_clip", clipLength);

  return {
    clip: LiveAPI.from(`${clipSlot.path} clip`),
    sceneIndex,
  };
}

/**
 * @typedef {object} ArrangementClipResult
 * @property {LiveAPI} clip
 * @property {number | null} arrangementStartBeats
 */

/**
 * Creates an arrangement clip on a track
 * @param {number} trackIndex - Track index (0-based)
 * @param {number | null} arrangementStartBeats - Starting position in beats
 * @param {number} clipLength - Clip length in beats
 * @returns {ArrangementClipResult} - Object with clip and arrangementStartBeats
 */
function createArrangementClip(trackIndex, arrangementStartBeats, clipLength) {
  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
  const newClipResult = /** @type {string} */ (
    track.call("create_midi_clip", arrangementStartBeats, clipLength)
  );
  const clip = LiveAPI.from(newClipResult);

  if (!clip.exists()) {
    throw new Error("failed to create Arrangement clip");
  }

  return { clip, arrangementStartBeats };
}

/**
 * Processes one clip creation at a specific position
 * @param {string} view - View type (session or arrangement)
 * @param {number} trackIndex - Track index
 * @param {number | null} sceneIndex - Scene index for session clips (explicit position)
 * @param {number | null} arrangementStartBeats - Arrangement start in beats (explicit position)
 * @param {string | null} arrangementStart - Arrangement start in bar|beat format (for result)
 * @param {number} clipLength - Clip length in beats
 * @param {LiveAPI} liveSet - LiveAPI live_set object
 * @param {number | null} startBeats - Loop start in beats
 * @param {number | null} endBeats - Loop end in beats
 * @param {number | null} firstStartBeats - First playback start in beats
 * @param {boolean | null} looping - Whether the clip is looping
 * @param {string | undefined} clipName - Clip name
 * @param {string | null} color - Clip color
 * @param {number} timeSigNumerator - Clip time signature numerator
 * @param {number} timeSigDenominator - Clip time signature denominator
 * @param {string | null} notationString - Original notation string
 * @param {Array<MidiNote>} notes - Array of MIDI notes
 * @param {string | null} length - Original length parameter
 * @param {string | null} sampleFile - Audio file path (for audio clips)
 * @returns {object} - Clip result for this iteration
 */
export function processClipIteration(
  view,
  trackIndex,
  sceneIndex,
  arrangementStartBeats,
  arrangementStart,
  clipLength,
  liveSet,
  startBeats,
  endBeats,
  firstStartBeats,
  looping,
  clipName,
  color,
  timeSigNumerator,
  timeSigDenominator,
  notationString,
  notes,
  length,
  sampleFile,
) {
  let clip;
  let currentSceneIndex;

  if (sampleFile) {
    // Audio clip creation
    if (view === "session") {
      // sceneIndex is guaranteed to be valid for session view (validated in calling code)
      const validSceneIndex = /** @type {number} */ (sceneIndex);
      const result = createAudioSessionClip(
        trackIndex,
        validSceneIndex,
        sampleFile,
        liveSet,
        MAX_AUTO_CREATED_SCENES,
      );

      clip = result.clip;
      currentSceneIndex = result.sceneIndex;
    } else {
      // Arrangement view
      const result = createAudioArrangementClip(
        trackIndex,
        arrangementStartBeats,
        sampleFile,
      );

      clip = result.clip;
    }

    // For audio clips: only set name and color (no looping, timing, or notes)
    /** @type {Record<string, unknown>} */
    const propsToSet = {};

    if (clipName) propsToSet.name = clipName;
    if (color != null) propsToSet.color = color;

    if (Object.keys(propsToSet).length > 0) {
      clip.setAll(propsToSet);
    }
  } else {
    // MIDI clip creation
    if (view === "session") {
      // sceneIndex is guaranteed to be valid for session view (validated in calling code)
      const validSceneIndex = /** @type {number} */ (sceneIndex);
      const result = createSessionClip(
        trackIndex,
        validSceneIndex,
        clipLength,
        liveSet,
        MAX_AUTO_CREATED_SCENES,
      );

      clip = result.clip;
      currentSceneIndex = result.sceneIndex;
    } else {
      // Arrangement view
      const result = createArrangementClip(
        trackIndex,
        arrangementStartBeats,
        clipLength,
      );

      clip = result.clip;
    }

    const propsToSet = buildClipProperties(
      startBeats,
      endBeats,
      firstStartBeats,
      looping,
      clipName,
      color,
      timeSigNumerator,
      timeSigDenominator,
      clipLength,
    );

    clip.setAll(propsToSet);

    // v0 notes already filtered by applyV0Deletions in interpretNotation
    if (notes.length > 0) {
      clip.call("add_new_notes", { notes });
    }
  }

  return buildClipResult(
    clip,
    trackIndex,
    view,
    currentSceneIndex,
    arrangementStart,
    notationString,
    notes,
    length,
    timeSigNumerator,
    timeSigDenominator,
    sampleFile,
  );
}
