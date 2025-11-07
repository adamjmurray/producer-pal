import { formatNotation } from "../../notation//barbeat/barbeat-format-notation.js";
import { interpretNotation } from "../../notation//barbeat/barbeat-interpreter.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import { MAX_CLIP_BEATS } from "../constants.js";
import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";

/**
 * Updates properties of existing clips
 * @param {Object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string
 * @param {string} args.noteUpdateMode - How to handle existing notes: 'replace' or 'merge'
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.startMarker] - Start marker position in bar|beat format relative to clip start
 * @param {string} [args.length] - Clip length in bar:beat duration format (e.g., '4:0' = 4 bars)
 * @param {string} [args.loopStart] - Loop start position in bar|beat format relative to clip start
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @param {number} [args.gain] - Audio clip gain (0-1)
 * @param {number} [args.pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @returns {Object|Array<Object>} Single clip object or array of clip objects
 */
export function updateClip({
  ids,
  notes: notationString,
  noteUpdateMode,
  name,
  color,
  timeSignature,
  startMarker,
  length,
  loop,
  loopStart,
  gain,
  pitchShift,
  warpOp,
  warpBeatTime,
  warpSampleTime,
  warpDistance,
} = {}) {
  if (!ids) {
    throw new Error("updateClip failed: ids is required");
  }

  // Parse comma-separated string into array
  const clipIds = parseCommaSeparatedIds(ids);

  // Validate all IDs are clips, skip invalid ones
  const clips = validateIdTypes(clipIds, "clip", "updateClip", {
    skipInvalid: true,
  });

  const updatedClips = [];

  for (const clip of clips) {
    // Parse time signature if provided to get numerator/denominator
    let timeSigNumerator, timeSigDenominator;
    if (timeSignature != null) {
      const parsed = parseTimeSignature(timeSignature);
      timeSigNumerator = parsed.numerator;
      timeSigDenominator = parsed.denominator;
    } else {
      timeSigNumerator = clip.getProperty("signature_numerator");
      timeSigDenominator = clip.getProperty("signature_denominator");
    }

    // Track final note count for response
    let finalNoteCount = null;

    // Convert length parameter to end_marker and loop_end
    let endMarkerBeats = null;
    let loopEndBeats = null;
    if (length != null) {
      const lengthBeats = barBeatDurationToAbletonBeats(
        length,
        timeSigNumerator,
        timeSigDenominator,
      );
      const startMarkerBeats =
        barBeatToAbletonBeats(
          startMarker,
          timeSigNumerator,
          timeSigDenominator,
        ) || 0;
      endMarkerBeats = startMarkerBeats + lengthBeats;
      loopEndBeats = startMarkerBeats + lengthBeats;
    }

    clip.setAll({
      name: name,
      color: color,
      signature_numerator: timeSignature != null ? timeSigNumerator : null,
      signature_denominator: timeSignature != null ? timeSigDenominator : null,
      start_marker: barBeatToAbletonBeats(
        startMarker,
        timeSigNumerator,
        timeSigDenominator,
      ),
      end_marker: endMarkerBeats,
      loop_start: barBeatToAbletonBeats(
        loopStart,
        timeSigNumerator,
        timeSigDenominator,
      ),
      loop_end: loopEndBeats,
      looping: loop,
    });

    // Audio-specific parameters (only for audio clips)
    const isAudioClip = clip.getProperty("is_audio_clip") > 0;
    if (isAudioClip) {
      if (gain !== undefined) {
        clip.set("gain", gain);
      }

      if (pitchShift !== undefined) {
        const pitchCoarse = Math.floor(pitchShift);
        const pitchFine = Math.round((pitchShift - pitchCoarse) * 100);
        clip.set("pitch_coarse", pitchCoarse);
        clip.set("pitch_fine", pitchFine);
      }
    }

    if (notationString != null) {
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

      // Remove all notes and add new notes (v0s already filtered by applyV0Deletions)
      clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);
      if (notes.length > 0) {
        clip.call("add_new_notes", { notes });
      }

      // Query actual note count within playback region (consistent with read-clip)
      const lengthBeats = clip.getProperty("length");
      const actualNotesResult = JSON.parse(
        clip.call("get_notes_extended", 0, 128, 0, lengthBeats),
      );
      finalNoteCount = actualNotesResult?.notes?.length || 0;
    }

    // Handle warp marker operations (audio clips only)
    if (warpOp != null) {
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

    // Build optimistic result object
    const clipResult = {
      id: clip.id,
    };

    // Only include noteCount if notes were modified
    if (finalNoteCount != null) {
      clipResult.noteCount = finalNoteCount;
    }

    updatedClips.push(clipResult);
  }

  // Return single object if one valid result, array for multiple results or empty array for none
  if (updatedClips.length === 0) {
    return [];
  }
  return updatedClips.length === 1 ? updatedClips[0] : updatedClips;
}
