import * as console from "../../shared/v8-max-console.js";
import {
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_PRO,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_TONES,
  MAX_CLIP_BEATS,
  WARP_MODE,
} from "../constants.js";
import { createAudioClipInSession } from "../shared/arrangement-tiling.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import { formatNotation } from "../../notation/barbeat/barbeat-format-notation.js";
import { interpretNotation } from "../../notation/barbeat/barbeat-interpreter.js";
import { dbToLiveGain } from "../shared/gain-utils.js";

/**
 * Get the actual content end position by examining all notes in a clip.
 * This is needed for unlooped clips where end_marker is unreliable.
 * @param {LiveAPI} clip - The clip to analyze
 * @returns {number} The end position of the last note in beats, or 0 if no notes
 */
export function getActualContentEnd(clip) {
  try {
    // For unlooped clips, we need to check ALL notes, not just up to current length
    // Use MAX_CLIP_BEATS to ensure we get all possible notes
    const notesDictionary = clip.call(
      "get_notes_extended",
      0,
      128,
      0,
      MAX_CLIP_BEATS,
    );
    const notes = JSON.parse(notesDictionary).notes;

    if (!notes || notes.length === 0) {
      return 0; // No notes = no content
    }

    // Find the maximum end position (start_time + duration)
    return Math.max(...notes.map((note) => note.start_time + note.duration));
  } catch (error) {
    console.error(
      `Warning: Failed to get notes for clip ${clip.id}: ${error.message}`,
    );
    return 0; // Fall back to treating as no content
  }
}

/**
 * Get the actual audio content end position for unlooped audio clips.
 * For unwarped clips: calculates from sample_length, sample_rate, and tempo.
 * For warped clips: uses warp markers (second-to-last marker).
 * @param {LiveAPI} clip - The audio clip to analyze
 * @returns {number} The end position of the audio in beats
 */
export function getActualAudioEnd(clip) {
  try {
    const isWarped = clip.getProperty("warping") === 1;

    if (!isWarped) {
      // Unwarped clip: calculate from sample properties and tempo
      const sampleLength = clip.getProperty("sample_length");
      const sampleRate = clip.getProperty("sample_rate");

      if (!sampleLength || !sampleRate) {
        console.error(
          `Warning: Missing sample properties for unwarped clip ${clip.id}`,
        );
        return 0;
      }

      // Get tempo from live_set
      const liveSet = new LiveAPI("live_set");
      const tempo = liveSet.getProperty("tempo");

      if (!tempo) {
        console.error(`Warning: Could not get tempo from live_set`);
        return 0;
      }

      // Calculate audio duration in beats
      const durationSeconds = sampleLength / sampleRate;
      const beatsPerSecond = tempo / 60;
      const durationBeats = durationSeconds * beatsPerSecond;
      return durationBeats;
    } else {
      // Warped clip: use warp markers
      const warpMarkersJson = clip.getProperty("warp_markers");
      const warpData = JSON.parse(warpMarkersJson);

      if (!warpData.warp_markers || warpData.warp_markers.length === 0) {
        return 0; // No warp markers = no content info available
      }

      const markers = warpData.warp_markers;

      // Use second-to-last warp marker (last one is often beyond actual content)
      if (markers.length < 2) {
        // If only one marker, use it
        return markers[0].beat_time;
      }

      // Use second-to-last marker to get actual audio end
      const secondToLast = markers[markers.length - 2];
      return secondToLast.beat_time;
    }
  } catch (error) {
    console.error(
      `Warning: Failed to get actual audio end for clip ${clip.id}: ${error.message}`,
    );
    return 0; // Fall back to treating as no content
  }
}

/**
 * Reveals hidden content in an unwarped audio clip using session holding area technique.
 * Creates a temp warped/looped clip, sets markers, then restores unwarp/unloop state.
 * ONLY used for unlooped + unwarped + audio clips with hidden content.
 *
 * @param {LiveAPI} sourceClip - The source clip to get audio file from
 * @param {LiveAPI} track - The track to work with
 * @param {number} newStartMarker - Start marker for revealed content
 * @param {number} newEndMarker - End marker for revealed content
 * @param {number} targetPosition - Where to place revealed clip in arrangement
 * @param {Object} context - Context object with paths
 * @returns {LiveAPI} The revealed clip in arrangement
 */
export function revealUnwarpedAudioContent(
  sourceClip,
  track,
  newStartMarker,
  newEndMarker,
  targetPosition,
  _context,
) {
  // 1. Get audio file path
  const filePath = sourceClip.getProperty("file_path");

  console.error(
    `WARNING: Extending unwarped audio clip requires recreating the extended portion due to Live API limitations. Envelopes will be lost in the revealed section.`,
  );

  // 2. Create temp clip in session holding area from that file
  // IMPORTANT: Set length to newEndMarker (not targetLength) to include all content from start of file
  const { clip: tempClip, slot: tempSlot } = createAudioClipInSession(
    track,
    newEndMarker, // Full length to include all content up to reveal end
    filePath, // Use actual audio file instead of silence.wav
  );

  // 3. Set markers in BEATS while warped and looped
  // (start_marker can only be set when looping AND warping are enabled)
  // start_marker hides content before the revealed portion
  tempClip.set("loop_end", newEndMarker);
  tempClip.set("loop_start", newStartMarker);
  tempClip.set("end_marker", newEndMarker);
  tempClip.set("start_marker", newStartMarker);

  // 4. Duplicate to arrangement WHILE STILL WARPED (this preserves markers!)
  const result = track.call(
    "duplicate_clip_to_arrangement",
    `id ${tempClip.id}`,
    targetPosition,
  );
  const revealedClip = LiveAPI.from(result);

  // 5. NOW unwarp and unloop the ARRANGEMENT clip (markers auto-convert from beats to seconds)
  revealedClip.set("warping", 0);
  revealedClip.set("looping", 0);

  // 6. Shorten the clip to only show the revealed portion
  // The clip currently shows from start_marker to end of audio
  // We want it to only show from newStartMarker to newEndMarker (in beats, now converted to seconds)
  const revealedClipEndTime = revealedClip.getProperty("end_time");
  const targetLengthBeats = newEndMarker - newStartMarker;

  // Use the temp clip shortening technique to trim the clip to the correct length
  const { clip: tempShortenerClip, slot: tempShortenerSlot } =
    createAudioClipInSession(
      track,
      targetLengthBeats,
      sourceClip.getProperty("file_path"),
    );

  const tempShortenerResult = track.call(
    "duplicate_clip_to_arrangement",
    `id ${tempShortenerClip.id}`,
    revealedClipEndTime,
  );
  const tempShortener = LiveAPI.from(tempShortenerResult);

  // Clean up temp shortener clips
  tempShortenerSlot.call("delete_clip");
  track.call("delete_clip", `id ${tempShortener.id}`);

  // 7. Clean up temp clip from session
  tempSlot.call("delete_clip");

  return revealedClip;
}

/**
 * Sets audio-specific parameters on a clip
 * @param {LiveAPI} clip - The audio clip
 * @param {number} [gainDb] - Audio clip gain in decibels (-70 to 24)
 * @param {number} [pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @param {string} [warpMode] - Audio clip warp mode
 * @param {boolean} [warping] - Audio clip warping on/off
 */
export function setAudioParameters(
  clip,
  { gainDb, pitchShift, warpMode, warping },
) {
  if (gainDb !== undefined) {
    const liveGain = dbToLiveGain(gainDb);
    clip.set("gain", liveGain);
  }

  if (pitchShift !== undefined) {
    const pitchCoarse = Math.floor(pitchShift);
    const pitchFine = Math.round((pitchShift - pitchCoarse) * 100);
    clip.set("pitch_coarse", pitchCoarse);
    clip.set("pitch_fine", pitchFine);
  }

  if (warpMode !== undefined) {
    const warpModeValue = {
      [WARP_MODE.BEATS]: LIVE_API_WARP_MODE_BEATS,
      [WARP_MODE.TONES]: LIVE_API_WARP_MODE_TONES,
      [WARP_MODE.TEXTURE]: LIVE_API_WARP_MODE_TEXTURE,
      [WARP_MODE.REPITCH]: LIVE_API_WARP_MODE_REPITCH,
      [WARP_MODE.COMPLEX]: LIVE_API_WARP_MODE_COMPLEX,
      [WARP_MODE.REX]: LIVE_API_WARP_MODE_REX,
      [WARP_MODE.PRO]: LIVE_API_WARP_MODE_PRO,
    }[warpMode];
    if (warpModeValue !== undefined) {
      clip.set("warp_mode", warpModeValue);
    }
  }

  if (warping !== undefined) {
    clip.set("warping", warping ? 1 : 0);
  }
}

/**
 * Handles warp marker operations on a clip
 * @param {LiveAPI} clip - The audio clip
 * @param {string} warpOp - Operation: add, move, or remove
 * @param {number} warpBeatTime - Beat time for the warp marker
 * @param {number} [warpSampleTime] - Sample time (for add operation)
 * @param {number} [warpDistance] - Distance to move (for move operation)
 */
export function handleWarpMarkerOperation(
  clip,
  warpOp,
  warpBeatTime,
  warpSampleTime,
  warpDistance,
) {
  // Validate audio clip
  const hasAudioFile = clip.getProperty("file_path") != null;
  if (!hasAudioFile) {
    throw new Error(
      `Warp markers only available on audio clips (clip ${clip.id} is MIDI or empty)`,
    );
  }

  // Validate required parameters per operation
  if (warpBeatTime == null) {
    throw new Error(`warpBeatTime required for ${warpOp} operation`);
  }

  switch (warpOp) {
    case "add": {
      // Add warp marker with optional sample time
      const args =
        warpSampleTime != null
          ? { beat_time: warpBeatTime, sample_time: warpSampleTime }
          : { beat_time: warpBeatTime };

      clip.call("add_warp_marker", args);
      break;
    }

    case "move": {
      if (warpDistance == null) {
        throw new Error("warpDistance required for move operation");
      }

      clip.call("move_warp_marker", warpBeatTime, warpDistance);
      break;
    }

    case "remove": {
      clip.call("remove_warp_marker", warpBeatTime);
      break;
    }
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
