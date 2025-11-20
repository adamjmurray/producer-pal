import {
  abletonBeatsToBarBeatDuration,
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
  barBeatToBeats,
  beatsToBarBeat,
} from "../../notation/barbeat/barbeat-time.js";
import { MAX_AUTO_CREATED_SCENES } from "../constants.js";

/**
 * Determine clip time signature (custom or from song)
 * @param {string} timeSignature - Optional time signature string
 * @param {number} songTimeSigNumerator - Song time signature numerator
 * @param {number} songTimeSigDenominator - Song time signature denominator
 * @param {Function} parseTimeSignature - Function to parse time signature string
 * @returns {{numerator: number, denominator: number}} Time signature components
 */
export function determineClipTimeSignature(
  timeSignature,
  songTimeSigNumerator,
  songTimeSigDenominator,
  parseTimeSignature,
) {
  if (timeSignature != null) {
    return parseTimeSignature(timeSignature);
  }
  // Use song time signature as default for clips
  return {
    numerator: songTimeSigNumerator,
    denominator: songTimeSigDenominator,
  };
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
 * @param {number} sceneIndex - Base scene index
 * @param {number} clipLength - Clip length in beats
 * @param {object} liveSet - LiveAPI live_set object
 * @param {number} i - Current iteration index
 * @param {number} maxAutoCreatedScenes - Maximum scenes allowed
 * @returns {object} - Object with clip and sceneIndex
 */
function createSessionClip(
  trackIndex,
  sceneIndex,
  clipLength,
  liveSet,
  i,
  maxAutoCreatedScenes,
) {
  const currentSceneIndex = sceneIndex + i;

  // Auto-create scenes if needed
  if (currentSceneIndex >= maxAutoCreatedScenes) {
    throw new Error(
      `createClip failed: sceneIndex ${currentSceneIndex} exceeds the maximum allowed value of ${
        MAX_AUTO_CREATED_SCENES - 1
      }`,
    );
  }

  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (currentSceneIndex >= currentSceneCount) {
    const scenesToCreate = currentSceneIndex - currentSceneCount + 1;
    for (let j = 0; j < scenesToCreate; j++) {
      liveSet.call("create_scene", -1); // -1 means append at the end
    }
  }

  const clipSlot = new LiveAPI(
    `live_set tracks ${trackIndex} clip_slots ${currentSceneIndex}`,
  );
  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `createClip failed: a clip already exists at track ${trackIndex}, clip slot ${currentSceneIndex}`,
    );
  }
  clipSlot.call("create_clip", clipLength);
  return {
    clip: new LiveAPI(`${clipSlot.path} clip`),
    sceneIndex: currentSceneIndex,
  };
}

/**
 * Creates an arrangement clip on a track
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} arrangementStartBeats - Starting position in beats
 * @param {number} clipLength - Clip length in beats
 * @param {number} i - Current iteration index
 * @returns {object} - Object with clip and arrangementStartBeats
 */
function createArrangementClip(
  trackIndex,
  arrangementStartBeats,
  clipLength,
  i,
) {
  const currentArrangementStartBeats = arrangementStartBeats + i * clipLength;

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  if (!track.exists()) {
    throw new Error(
      `createClip failed: track with index ${trackIndex} does not exist`,
    );
  }

  const newClipResult = track.call(
    "create_midi_clip",
    currentArrangementStartBeats,
    clipLength,
  );
  const clip = LiveAPI.from(newClipResult);
  if (!clip.exists()) {
    throw new Error("createClip failed: failed to create Arrangement clip");
  }

  return { clip, arrangementStartBeats: currentArrangementStartBeats };
}

/**
 * Builds the properties object to set on a clip
 * @param {number} startBeats - Loop start position in beats
 * @param {number} endBeats - Loop end position in beats
 * @param {number} firstStartBeats - First playback start position in beats
 * @param {boolean} looping - Whether the clip is looping
 * @param {string} clipName - Clip name
 * @param {string} color - Clip color in hex format
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {object} - Clip properties to set
 */
function buildClipProperties(
  startBeats,
  endBeats,
  firstStartBeats,
  looping,
  clipName,
  color,
  timeSigNumerator,
  timeSigDenominator,
) {
  // Determine start_marker value
  let startMarkerBeats = null;
  if (firstStartBeats != null && looping !== false) {
    // firstStart takes precedence for looping clips
    startMarkerBeats = firstStartBeats;
  } else if (startBeats != null) {
    // Use start as start_marker
    startMarkerBeats = startBeats;
  }

  // Set properties based on looping state
  const propsToSet = {
    name: clipName,
    color: color,
    signature_numerator: timeSigNumerator,
    signature_denominator: timeSigDenominator,
    start_marker: startMarkerBeats,
    looping: looping,
  };

  // Set loop properties for looping clips
  if (looping === true || looping == null) {
    if (startBeats != null) {
      propsToSet.loop_start = startBeats;
    }
    if (endBeats != null) {
      propsToSet.loop_end = endBeats;
    }
  }

  // Set end_marker for non-looping clips
  if (looping === false) {
    if (endBeats != null) {
      propsToSet.end_marker = endBeats;
    }
  }

  return propsToSet;
}

/**
 * Builds the result object for a created clip
 * @param {object} clip - LiveAPI clip object
 * @param {number} trackIndex - Track index
 * @param {string} view - View type (session or arrangement)
 * @param {number} sceneIndex - Scene index for session clips
 * @param {number} i - Current iteration index
 * @param {string} arrangementStart - Arrangement start in bar|beat format
 * @param {number} songTimeSigNumerator - Song time signature numerator
 * @param {number} songTimeSigDenominator - Song time signature denominator
 * @param {number} clipLength - Clip length in beats
 * @param {string} notationString - Original notation string
 * @param {Array} notes - Array of MIDI notes
 * @param {string} length - Original length parameter
 * @param {number} timeSigNumerator - Clip time signature numerator
 * @param {number} timeSigDenominator - Clip time signature denominator
 * @returns {object} - Clip result object
 */
function buildClipResult(
  clip,
  trackIndex,
  view,
  sceneIndex,
  i,
  arrangementStart,
  songTimeSigNumerator,
  songTimeSigDenominator,
  clipLength,
  notationString,
  notes,
  length,
  timeSigNumerator,
  timeSigDenominator,
) {
  const clipResult = {
    id: clip.id,
    trackIndex,
  };

  // Add view-specific properties
  if (view === "session") {
    clipResult.sceneIndex = sceneIndex;
  } else if (i === 0) {
    // Calculate bar|beat position for this clip
    clipResult.arrangementStart = arrangementStart;
  } else {
    // Convert clipLength back to bar|beat format and add to original position
    const clipLengthInMusicalBeats = clipLength * (songTimeSigDenominator / 4);
    const totalOffsetBeats = i * clipLengthInMusicalBeats;
    const originalBeats = barBeatToBeats(
      arrangementStart,
      songTimeSigNumerator,
    );
    const newPositionBeats = originalBeats + totalOffsetBeats;
    clipResult.arrangementStart = beatsToBarBeat(
      newPositionBeats,
      songTimeSigNumerator,
    );
  }

  // Only include noteCount if notes were provided
  if (notationString != null) {
    clipResult.noteCount = notes.length;

    // Include calculated length if it wasn't provided as input parameter
    if (length == null) {
      clipResult.length = abletonBeatsToBarBeatDuration(
        clipLength,
        timeSigNumerator,
        timeSigDenominator,
      );
    }
  }

  return clipResult;
}

/**
 * Processes one iteration of clip creation
 * @param {number} i - Current iteration index
 * @param {string} view - View type (session or arrangement)
 * @param {number} trackIndex - Track index
 * @param {number} sceneIndex - Scene index for session clips
 * @param {number} arrangementStartBeats - Arrangement start in beats
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
 * @param {number} songTimeSigNumerator - Song time signature numerator
 * @param {number} songTimeSigDenominator - Song time signature denominator
 * @param {string} arrangementStart - Arrangement start in bar|beat format
 * @param {string} length - Original length parameter
 * @returns {object} - Clip result for this iteration
 */
export function processClipIteration(
  i,
  view,
  trackIndex,
  sceneIndex,
  arrangementStartBeats,
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
  songTimeSigNumerator,
  songTimeSigDenominator,
  arrangementStart,
  length,
) {
  let clip;
  let currentSceneIndex;

  if (view === "session") {
    const result = createSessionClip(
      trackIndex,
      sceneIndex,
      clipLength,
      liveSet,
      i,
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
      i,
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
  );

  clip.setAll(propsToSet);

  // v0 notes already filtered by applyV0Deletions in interpretNotation
  if (notes.length > 0) {
    clip.call("add_new_notes", { notes });
  }

  const clipResult = buildClipResult(
    clip,
    trackIndex,
    view,
    currentSceneIndex,
    i,
    arrangementStart,
    songTimeSigNumerator,
    songTimeSigDenominator,
    clipLength,
    notationString,
    notes,
    length,
    timeSigNumerator,
    timeSigDenominator,
  );

  return clipResult;
}
