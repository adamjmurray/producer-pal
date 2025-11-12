import { formatNotation } from "../../notation//barbeat/barbeat-format-notation.js";
import { interpretNotation } from "../../notation//barbeat/barbeat-interpreter.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import {
  MAX_CLIP_BEATS,
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_TONES,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_PRO,
  WARP_MODE,
} from "../constants.js";
import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";

/**
 * Updates properties of existing clips
 * @param {Object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.noteUpdateMode="merge"] - How to handle existing notes: 'replace' or 'merge'
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.start] - Bar|beat position where loop/clip region begins
 * @param {string} [args.length] - Duration in bar:beat format. end = start + length
 * @param {string} [args.firstStart] - Bar|beat position for initial playback start (only needed when different from start)
 * @param {boolean} [args.looping] - Enable looping for the clip
 * @param {number} [args.gain] - Audio clip gain (0-1)
 * @param {number} [args.pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @param {string} [args.warpMode] - Audio clip warp mode: beats, tones, texture, repitch, complex, rex, pro
 * @param {boolean} [args.warping] - Audio clip warping on/off
 * @returns {Object|Array<Object>} Single clip object or array of clip objects
 */
export function updateClip({
  ids,
  notes: notationString,
  noteUpdateMode = "merge",
  name,
  color,
  timeSignature,
  start,
  length,
  firstStart,
  looping,
  gain,
  pitchShift,
  warpMode,
  warping,
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

    // Determine current looping state (needed for boundary calculations)
    const isLooping =
      looping != null ? looping : clip.getProperty("looping") > 0;

    // Handle firstStart warning for non-looping clips
    if (firstStart != null && !isLooping) {
      console.error(
        "Warning: firstStart parameter ignored for non-looping clips",
      );
    }

    // Calculate boundary positions
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

    // Determine if we need to set end before start to avoid "LoopStart behind LoopEnd" error
    let setEndFirst = false;
    if (isLooping && startBeats != null && endBeats != null) {
      const currentLoopEnd = clip.getProperty("loop_end");
      // If new start would be beyond current end, set end first
      if (startBeats > currentLoopEnd) {
        setEndFirst = true;
      }
    }

    // Set properties based on looping state and ordering requirements
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

    clip.setAll(propsToSet);

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
