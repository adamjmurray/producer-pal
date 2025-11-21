import { formatNotation } from "../../../../notation/barbeat/barbeat-format-notation.js";
import { interpretNotation } from "../../../../notation/barbeat/interpreter/barbeat-interpreter.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../../../notation/barbeat/time/barbeat-time.js";
import * as console from "../../../../shared/v8-max-console.js";
import { MAX_CLIP_BEATS } from "../../../constants.js";
import {
  getActualAudioEnd,
  revealUnwarpedAudioContent,
  setAudioParameters,
  handleWarpMarkerOperation,
} from "./update-clip-audio-helpers.js";

// Re-export audio helpers for existing imports
export {
  getActualAudioEnd,
  revealUnwarpedAudioContent,
  setAudioParameters,
  handleWarpMarkerOperation,
};

/**
 * Get the actual content end position by examining all notes in a clip
 * @param {LiveAPI} clip - The clip to analyze
 * @returns {number} The end position of the last note in beats, or 0 if no notes
 */
export function getActualContentEnd(clip) {
  try {
    // For unlooped clips, check ALL notes using MAX_CLIP_BEATS
    const notesDictionary = clip.call(
      "get_notes_extended",
      0,
      128,
      0,
      MAX_CLIP_BEATS,
    );
    const notes = JSON.parse(notesDictionary).notes;
    if (!notes || notes.length === 0) return 0;
    return Math.max(...notes.map((note) => note.start_time + note.duration));
  } catch (error) {
    console.error(
      `Warning: Failed to get notes for clip ${clip.id}: ${error.message}`,
    );
    return 0;
  }
}

/**
 * Parse and get song time signature from live_set
 * @returns {{numerator: number, denominator: number}} Time signature components
 */
export function parseSongTimeSignature() {
  const liveSet = new LiveAPI("live_set");
  return {
    numerator: liveSet.getProperty("signature_numerator"),
    denominator: liveSet.getProperty("signature_denominator"),
  };
}

/**
 * Calculate beat positions from bar|beat notation
 * @param {object} args - Calculation arguments
 * @param args.start
 * @param args.length
 * @param args.firstStart
 * @param args.timeSigNumerator
 * @param args.timeSigDenominator
 * @param args.clip
 * @param args.isLooping
 * @returns {{startBeats, endBeats, firstStartBeats, startMarkerBeats}} Beat positions
 */
export function calculateBeatPositions({
  start,
  length,
  firstStart,
  timeSigNumerator,
  timeSigDenominator,
  clip,
  isLooping,
}) {
  let startBeats = null,
    endBeats = null,
    firstStartBeats = null,
    startMarkerBeats = null;
  if (start != null) {
    startBeats = barBeatToAbletonBeats(
      start,
      timeSigNumerator,
      timeSigDenominator,
    );
  }
  if (length != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );
    if (startBeats == null) {
      if (isLooping) {
        startBeats = clip.getProperty("loop_start");
      } else {
        // For non-looping clips, derive from end_marker - length
        const currentEndMarker = clip.getProperty("end_marker");
        const currentStartMarker = clip.getProperty("start_marker");
        startBeats = currentEndMarker - lengthBeats;
        if (
          Math.abs(startBeats - currentStartMarker) > 0.001 &&
          currentStartMarker != null
        ) {
          console.error(
            `Warning: Derived start (${startBeats}) differs from current start_marker (${currentStartMarker})`,
          );
        }
      }
    }
    endBeats = startBeats + lengthBeats;
  }
  if (firstStart != null && isLooping) {
    firstStartBeats = barBeatToAbletonBeats(
      firstStart,
      timeSigNumerator,
      timeSigDenominator,
    );
  }
  if (firstStartBeats != null) {
    startMarkerBeats = firstStartBeats;
  } else if (startBeats != null) {
    startMarkerBeats = startBeats;
  }
  return { startBeats, endBeats, firstStartBeats, startMarkerBeats };
}

/**
 * Build properties map for setAll
 * @param {object} args - Property building arguments
 * @param args.name
 * @param args.color
 * @param args.timeSignature
 * @param args.timeSigNumerator
 * @param args.timeSigDenominator
 * @param args.startMarkerBeats
 * @param args.looping
 * @param args.isLooping
 * @param args.startBeats
 * @param args.endBeats
 * @param args.currentLoopEnd
 * @returns {object} Properties object ready for clip.setAll()
 */
export function buildClipPropertiesToSet({
  name,
  color,
  timeSignature,
  timeSigNumerator,
  timeSigDenominator,
  startMarkerBeats,
  looping,
  isLooping,
  startBeats,
  endBeats,
  currentLoopEnd,
}) {
  const setEndFirst =
    isLooping && startBeats != null && endBeats != null
      ? startBeats > currentLoopEnd
      : false;
  const propsToSet = {
    name: name,
    color: color,
    signature_numerator: timeSignature != null ? timeSigNumerator : null,
    signature_denominator: timeSignature != null ? timeSigDenominator : null,
    start_marker: startMarkerBeats,
    looping: looping,
  };
  if (isLooping || looping == null) {
    if (setEndFirst && endBeats != null && looping !== false) {
      propsToSet.loop_end = endBeats;
    }
    if (startBeats != null && looping !== false) {
      propsToSet.loop_start = startBeats;
    }
    if (!setEndFirst && endBeats != null && looping !== false) {
      propsToSet.loop_end = endBeats;
    }
  }
  // Set end_marker for non-looping clips
  if (!isLooping || looping === false) {
    if (endBeats != null) {
      propsToSet.end_marker = endBeats;
    }
  }
  return propsToSet;
}

/**
 * Handle note updates (merge or replace)
 * @param clip
 * @param notationString
 * @param noteUpdateMode
 * @param timeSigNumerator
 * @param timeSigDenominator
 * @returns {number|null} Final note count, or null if notes not modified
 */
export function handleNoteUpdates(
  clip,
  notationString,
  noteUpdateMode,
  timeSigNumerator,
  timeSigDenominator,
) {
  if (notationString == null) {
    return null;
  }
  let combinedNotationString = notationString;
  if (noteUpdateMode === "merge") {
    // In merge mode, prepend existing notes as bar|beat notation
    const existingNotesResult = JSON.parse(
      clip.call("get_notes_extended", 0, 128, 0, MAX_CLIP_BEATS),
    );
    const existingNotes = existingNotesResult?.notes || [];
    if (existingNotes.length > 0) {
      const existingNotationString = formatNotation(existingNotes, {
        timeSigNumerator,
        timeSigDenominator,
      });
      combinedNotationString = `${existingNotationString} ${notationString}`;
    }
  }
  const notes = interpretNotation(combinedNotationString, {
    timeSigNumerator,
    timeSigDenominator,
  });
  // Remove all notes and add new notes
  clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);
  if (notes.length > 0) {
    clip.call("add_new_notes", { notes });
  }
  // Query actual note count within playback region
  const lengthBeats = clip.getProperty("length");
  const actualNotesResult = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, lengthBeats),
  );
  return actualNotesResult?.notes?.length || 0;
}

/**
 * Handle moving arrangement clips to a new position
 * @param {object} args - Operation arguments
 * @param args.clip
 * @param args.arrangementStartBeats
 * @param args.tracksWithMovedClips
 * @returns {string} The new clip ID after move
 */
export function handleArrangementStartOperation({
  clip,
  arrangementStartBeats,
  tracksWithMovedClips,
}) {
  const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;
  if (!isArrangementClip) {
    console.error(
      `Warning: arrangementStart parameter ignored for session clip (id ${clip.id})`,
    );
    return clip.id;
  }
  const trackIndex = clip.trackIndex;
  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const moveCount = (tracksWithMovedClips.get(trackIndex) || 0) + 1;
  tracksWithMovedClips.set(trackIndex, moveCount);
  const newClipResult = track.call(
    "duplicate_clip_to_arrangement",
    `id ${clip.id}`,
    arrangementStartBeats,
  );
  const newClip = LiveAPI.from(newClipResult);
  track.call("delete_clip", `id ${clip.id}`);
  return newClip.id;
}

/**
 * Process a single clip update
 * @param {object} params - Parameters object containing all update parameters
 */
export function processSingleClipUpdate(params) {
  const {
    clip,
    notationString,
    noteUpdateMode,
    name,
    color,
    timeSignature,
    start,
    length,
    firstStart,
    looping,
    gainDb,
    pitchShift,
    warpMode,
    warping,
    warpOp,
    warpBeatTime,
    warpSampleTime,
    warpDistance,
    arrangementLengthBeats,
    arrangementStartBeats,
    context,
    updatedClips,
    tracksWithMovedClips,
    parseTimeSignature,
    handleArrangementLengthOperation,
    buildClipResultObject,
  } = params;
  let timeSigNumerator, timeSigDenominator;
  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);
    timeSigNumerator = parsed.numerator;
    timeSigDenominator = parsed.denominator;
  } else {
    timeSigNumerator = clip.getProperty("signature_numerator");
    timeSigDenominator = clip.getProperty("signature_denominator");
  }

  let finalNoteCount = null;
  const isLooping = looping != null ? looping : clip.getProperty("looping") > 0;
  if (firstStart != null && !isLooping) {
    console.error(
      "Warning: firstStart parameter ignored for non-looping clips",
    );
  }
  const { startBeats, endBeats, startMarkerBeats } = calculateBeatPositions({
    start,
    length,
    firstStart,
    timeSigNumerator,
    timeSigDenominator,
    clip,
    isLooping,
  });
  const currentLoopEnd = isLooping ? clip.getProperty("loop_end") : null;
  const propsToSet = buildClipPropertiesToSet({
    name,
    color,
    timeSignature,
    timeSigNumerator,
    timeSigDenominator,
    startMarkerBeats,
    looping,
    isLooping,
    startBeats,
    endBeats,
    currentLoopEnd,
  });
  clip.setAll(propsToSet);
  const isAudioClip = clip.getProperty("is_audio_clip") > 0;
  if (isAudioClip) {
    setAudioParameters(clip, { gainDb, pitchShift, warpMode, warping });
  }
  finalNoteCount = handleNoteUpdates(
    clip,
    notationString,
    noteUpdateMode,
    timeSigNumerator,
    timeSigDenominator,
  );
  if (warpOp != null) {
    handleWarpMarkerOperation(
      clip,
      warpOp,
      warpBeatTime,
      warpSampleTime,
      warpDistance,
    );
  }
  let hasArrangementLengthResults = false;
  if (arrangementLengthBeats != null) {
    const results = handleArrangementLengthOperation({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      context,
    });
    if (results.length > 0) {
      updatedClips.push(...results);
      hasArrangementLengthResults = true;
    }
  }
  let finalClipId = clip.id;
  if (arrangementStartBeats != null) {
    finalClipId = handleArrangementStartOperation({
      clip,
      arrangementStartBeats,
      tracksWithMovedClips,
    });
  }
  if (!hasArrangementLengthResults) {
    updatedClips.push(buildClipResultObject(finalClipId, finalNoteCount));
  }
}
