import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.js";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.js";
import { applyModulations } from "#src/notation/modulation/modulation-evaluator.js";
import * as console from "#src/shared/v8-max-console.js";
import { MAX_CLIP_BEATS } from "#src/tools/constants.js";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.js";
import { handleArrangementStartOperation } from "./update-clip-arrangement-helpers.js";
import {
  setAudioParameters,
  handleWarpMarkerOperation,
} from "./update-clip-audio-helpers.js";

/**
 * Get the actual content end position by examining all notes in a clip.
 * This is needed for unlooped clips where end_marker is unreliable.
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

// Audio-specific helper functions are now in update-clip-audio-helpers.js

/**
 * Calculate beat positions from bar|beat notation
 * @param {object} args - Calculation arguments
 * @param {string} [args.start] - Start position in bar|beat notation
 * @param {string} [args.length] - Length in bar|beat notation
 * @param {string} [args.firstStart] - First start position in bar|beat notation
 * @param {number} args.timeSigNumerator - Time signature numerator
 * @param {number} args.timeSigDenominator - Time signature denominator
 * @param {LiveAPI} args.clip - The clip to read defaults from
 * @param {boolean} args.isLooping - Whether clip is looping
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
  let startBeats = null;
  let endBeats = null;
  let firstStartBeats = null;
  let startMarkerBeats = null;
  // Convert start to beats if provided
  if (start != null) {
    startBeats = barBeatToAbletonBeats(
      start,
      timeSigNumerator,
      timeSigDenominator,
    );
  }
  // Calculate end from start + length
  if (length != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );
    // If start not provided, read current value from clip
    if (startBeats == null) {
      if (isLooping) {
        startBeats = clip.getProperty("loop_start");
      } else {
        // For non-looping clips, derive from end_marker - length
        const currentEndMarker = clip.getProperty("end_marker");
        const currentStartMarker = clip.getProperty("start_marker");
        startBeats = currentEndMarker - lengthBeats;
        // Sanity check: warn if derived start doesn't match start_marker
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
  // Handle firstStart for looping clips
  if (firstStart != null && isLooping) {
    firstStartBeats = barBeatToAbletonBeats(
      firstStart,
      timeSigNumerator,
      timeSigDenominator,
    );
  }
  // Determine start_marker value
  if (firstStartBeats != null) {
    // firstStart takes precedence
    startMarkerBeats = firstStartBeats;
  } else if (startBeats != null && !isLooping) {
    // For non-looping clips, start_marker = start
    startMarkerBeats = startBeats;
  } else if (startBeats != null && isLooping) {
    // For looping clips without firstStart, start_marker = start
    startMarkerBeats = startBeats;
  }
  return { startBeats, endBeats, firstStartBeats, startMarkerBeats };
}

/**
 * Build properties map for setAll
 * @param {object} args - Property building arguments
 * @param {string} args.name - Clip name
 * @param {string} args.color - Clip color
 * @param {string} args.timeSignature - Time signature string
 * @param {number} args.timeSigNumerator - Time signature numerator
 * @param {number} args.timeSigDenominator - Time signature denominator
 * @param {number} args.startMarkerBeats - Start marker position in beats
 * @param {boolean} args.looping - Whether looping is enabled
 * @param {boolean} args.isLooping - Current looping state
 * @param {number} args.startBeats - Start position in beats
 * @param {number} args.endBeats - End position in beats
 * @param {number} args.currentLoopEnd - Current loop end position in beats
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
  // Set loop properties for looping clips (order matters!)
  if (isLooping || looping == null) {
    if (setEndFirst && endBeats != null && looping !== false) {
      // Set end first to avoid "LoopStart behind LoopEnd" error
      propsToSet.loop_end = endBeats;
    }
    if (startBeats != null && looping !== false) {
      propsToSet.loop_start = startBeats;
    }
    if (!setEndFirst && endBeats != null && looping !== false) {
      // Set end after start in normal case
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
 * @param {LiveAPI} clip - The clip to update
 * @param {string} notationString - The notation string to apply
 * @param {string} modulationString - Modulation expressions to apply to notes
 * @param {string} noteUpdateMode - 'merge' or 'replace'
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number|null} Final note count, or null if notes not modified
 */
export function handleNoteUpdates(
  clip,
  notationString,
  modulationString,
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
  // Apply modulations to notes if provided
  applyModulations(
    notes,
    modulationString,
    timeSigNumerator,
    timeSigDenominator,
  );
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
 * Process a single clip update
 * @param {object} params - Parameters object containing all update parameters
 * @param {LiveAPI} params.clip - The clip to update
 * @param {string} params.notationString - Musical notation string
 * @param {string} params.noteUpdateMode - Note update mode (merge or replace)
 * @param {string} params.name - Clip name
 * @param {string} params.color - Clip color
 * @param {string} params.timeSignature - Time signature
 * @param {string} params.start - Start position
 * @param {string} params.length - Clip length
 * @param {string} params.firstStart - First start position
 * @param {boolean} params.looping - Looping enabled
 * @param {number} params.gainDb - Gain in decibels
 * @param {number} params.pitchShift - Pitch shift amount
 * @param {string} params.warpMode - Warp mode
 * @param {boolean} params.warping - Warping enabled
 * @param {string} params.warpOp - Warp operation type
 * @param {number} params.warpBeatTime - Warp beat time
 * @param {number} params.warpSampleTime - Warp sample time
 * @param {number} params.warpDistance - Warp distance
 * @param {number} params.arrangementLengthBeats - Arrangement length in beats
 * @param {number} params.arrangementStartBeats - Arrangement start in beats
 * @param {object} params.context - Context object
 * @param {Array} params.updatedClips - Array to collect updated clips
 * @param {Map} params.tracksWithMovedClips - Map of tracks with moved clips
 * @param {Function} params.parseTimeSignature - Function to parse time signature
 * @param {Function} params.handleArrangementLengthOperation - Function to handle arrangement length
 * @param {Function} params.buildClipResultObject - Function to build result object
 */
export function processSingleClipUpdate(params) {
  const {
    clip,
    notationString,
    modulationString,
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

  // Parse time signature if provided
  let timeSigNumerator, timeSigDenominator;
  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);
    timeSigNumerator = parsed.numerator;
    timeSigDenominator = parsed.denominator;
  } else {
    timeSigNumerator = clip.getProperty("signature_numerator");
    timeSigDenominator = clip.getProperty("signature_denominator");
  }

  // Track final note count
  let finalNoteCount = null;

  // Determine looping state
  const isLooping = looping != null ? looping : clip.getProperty("looping") > 0;

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && !isLooping) {
    console.error(
      "Warning: firstStart parameter ignored for non-looping clips",
    );
  }

  // Calculate beat positions
  const { startBeats, endBeats, startMarkerBeats } = calculateBeatPositions({
    start,
    length,
    firstStart,
    timeSigNumerator,
    timeSigDenominator,
    clip,
    isLooping,
  });

  // Build and set clip properties
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

  // Verify color quantization if color was set
  if (color != null) {
    verifyColorQuantization(clip, color);
  }

  // Audio-specific parameters
  const isAudioClip = clip.getProperty("is_audio_clip") > 0;
  if (isAudioClip) {
    setAudioParameters(clip, { gainDb, pitchShift, warpMode, warping });
  }

  // Handle note updates
  finalNoteCount = handleNoteUpdates(
    clip,
    notationString,
    modulationString,
    noteUpdateMode,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Handle warp marker operations
  if (warpOp != null) {
    handleWarpMarkerOperation(
      clip,
      warpOp,
      warpBeatTime,
      warpSampleTime,
      warpDistance,
    );
  }

  // Handle arrangementLength
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

  // Handle arrangementStart
  let finalClipId = clip.id;
  if (arrangementStartBeats != null) {
    finalClipId = handleArrangementStartOperation({
      clip,
      arrangementStartBeats,
      tracksWithMovedClips,
    });
  }

  // Build result object if arrangementLength didn't return results
  if (!hasArrangementLengthResults) {
    updatedClips.push(buildClipResultObject(finalClipId, finalNoteCount));
  }
}
