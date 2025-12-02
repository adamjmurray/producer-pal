import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.js";
import * as console from "#src/shared/v8-max-console.js";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.js";
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

// Re-export for use by create-clip.js
export { parseArrangementStartList };

/**
 * Parses scene indices with createClip-specific error message
 * @param {string} input - Comma-separated scene indices
 * @returns {number[]} - Array of scene indices
 */
export function parseSceneIndexList(input) {
  try {
    return parseSceneIndexListBase(input);
  } catch (error) {
    throw new Error(`createClip failed: ${error.message}`);
  }
}

/**
 * Builds a clip name based on count and iteration index
 * @param {string} name - Base clip name
 * @param {number} count - Total number of clips being created
 * @param {number} i - Current iteration index (0-based)
 * @returns {string|undefined} - Generated clip name
 */
export function buildClipName(name, count, i) {
  if (name == null) {
    return undefined;
  }

  if (count === 1) {
    return name;
  }

  if (i === 0) {
    return name;
  }

  return `${name} ${i + 1}`;
}

/**
 * Converts bar|beat timing parameters to Ableton beats
 * @param {string} arrangementStart - Arrangement start position in bar|beat format
 * @param {string} start - Loop start position in bar|beat format
 * @param {string} firstStart - First playback start position in bar|beat format
 * @param {string} length - Clip length in bar|beat duration format
 * @param {boolean} looping - Whether the clip is looping
 * @param {number} timeSigNumerator - Clip time signature numerator
 * @param {number} timeSigDenominator - Clip time signature denominator
 * @param {number} songTimeSigNumerator - Song time signature numerator
 * @param {number} songTimeSigDenominator - Song time signature denominator
 * @returns {object} - Converted timing parameters in beats
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
  const arrangementStartBeats = barBeatToAbletonBeats(
    arrangementStart,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );
  const startBeats = barBeatToAbletonBeats(
    start,
    timeSigNumerator,
    timeSigDenominator,
  );
  const firstStartBeats = barBeatToAbletonBeats(
    firstStart,
    timeSigNumerator,
    timeSigDenominator,
  );

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
 * Creates a session clip in a clip slot, auto-creating scenes if needed
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} sceneIndex - Target scene index (0-based)
 * @param {number} clipLength - Clip length in beats
 * @param {object} liveSet - LiveAPI live_set object
 * @param {number} maxAutoCreatedScenes - Maximum scenes allowed
 * @returns {object} - Object with clip and sceneIndex
 */
function createSessionClip(
  trackIndex,
  sceneIndex,
  clipLength,
  liveSet,
  maxAutoCreatedScenes,
) {
  // Auto-create scenes if needed
  if (sceneIndex >= maxAutoCreatedScenes) {
    throw new Error(
      `sceneIndex ${sceneIndex} exceeds the maximum allowed value of ${
        MAX_AUTO_CREATED_SCENES - 1
      }`,
    );
  }

  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex >= currentSceneCount) {
    const scenesToCreate = sceneIndex - currentSceneCount + 1;
    for (let j = 0; j < scenesToCreate; j++) {
      liveSet.call("create_scene", -1); // -1 means append at the end
    }
  }

  const clipSlot = new LiveAPI(
    `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
  );
  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `a clip already exists at track ${trackIndex}, clip slot ${sceneIndex}`,
    );
  }
  clipSlot.call("create_clip", clipLength);
  return {
    clip: new LiveAPI(`${clipSlot.path} clip`),
    sceneIndex,
  };
}

/**
 * Creates an arrangement clip on a track
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} arrangementStartBeats - Starting position in beats
 * @param {number} clipLength - Clip length in beats
 * @returns {object} - Object with clip and arrangementStartBeats
 */
function createArrangementClip(trackIndex, arrangementStartBeats, clipLength) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const newClipResult = track.call(
    "create_midi_clip",
    arrangementStartBeats,
    clipLength,
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
 * @param {number} sceneIndex - Scene index for session clips (explicit position)
 * @param {number} arrangementStartBeats - Arrangement start in beats (explicit position)
 * @param {string} arrangementStart - Arrangement start in bar|beat format (for result)
 * @param {number} clipLength - Clip length in beats
 * @param {object} liveSet - LiveAPI live_set object
 * @param {number} startBeats - Loop start in beats
 * @param {number} endBeats - Loop end in beats
 * @param {number} firstStartBeats - First playback start in beats
 * @param {boolean} looping - Whether the clip is looping
 * @param {string} clipName - Clip name
 * @param {string} color - Clip color
 * @param {number} timeSigNumerator - Clip time signature numerator
 * @param {number} timeSigDenominator - Clip time signature denominator
 * @param {string} notationString - Original notation string
 * @param {Array} notes - Array of MIDI notes
 * @param {string} length - Original length parameter
 * @param {string} sampleFile - Audio file path (for audio clips)
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
      const result = createAudioSessionClip(
        trackIndex,
        sceneIndex,
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
        clipLength,
      );
      clip = result.clip;
    }

    // For audio clips: only set name and color (no looping, timing, or notes)
    const propsToSet = {};
    if (clipName) propsToSet.name = clipName;
    if (color != null) propsToSet.color = color;

    if (Object.keys(propsToSet).length > 0) {
      clip.setAll(propsToSet);
    }
  } else {
    // MIDI clip creation
    if (view === "session") {
      const result = createSessionClip(
        trackIndex,
        sceneIndex,
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

  const clipResult = buildClipResult(
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

  return clipResult;
}
