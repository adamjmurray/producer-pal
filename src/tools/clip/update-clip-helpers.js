import * as console from "../../shared/v8-max-console.js";
import { MAX_CLIP_BEATS } from "../constants.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import { formatNotation } from "../../notation/barbeat/barbeat-format-notation.js";
import { interpretNotation } from "../../notation/barbeat/barbeat-interpreter.js";
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
 * @param {Object} args - Calculation arguments
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
 * @param {Object} args - Property building arguments
 * @returns {Object} Properties object ready for clip.setAll()
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
 * @param {string} noteUpdateMode - 'merge' or 'replace'
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
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
 * @param {Object} args - Operation arguments
 * @param {LiveAPI} args.clip - The clip to move
 * @param {number} args.arrangementStartBeats - New position in beats
 * @param {Map} args.tracksWithMovedClips - Track of clips moved per track
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
  // Get track and duplicate clip to new position
  const trackIndex = clip.trackIndex;
  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  // Track clips being moved to same track
  const moveCount = (tracksWithMovedClips.get(trackIndex) || 0) + 1;
  tracksWithMovedClips.set(trackIndex, moveCount);
  const newClipResult = track.call(
    "duplicate_clip_to_arrangement",
    `id ${clip.id}`,
    arrangementStartBeats,
  );
  const newClip = LiveAPI.from(newClipResult);
  // Delete original clip
  track.call("delete_clip", `id ${clip.id}`);
  // Return the new clip ID
  return newClip.id;
}

/**
 * Process a single clip update
 * @param {Object} params - Parameters object containing all update parameters
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

  // Audio-specific parameters
  const isAudioClip = clip.getProperty("is_audio_clip") > 0;
  if (isAudioClip) {
    setAudioParameters(clip, { gainDb, pitchShift, warpMode, warping });
  }

  // Handle note updates
  finalNoteCount = handleNoteUpdates(
    clip,
    notationString,
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
