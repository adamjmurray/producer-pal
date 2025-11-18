import * as console from "../../shared/v8-max-console.js";
import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";
import {
  parseSongTimeSignature,
  calculateBeatPositions,
  buildClipPropertiesToSet,
  handleNoteUpdates,
  handleArrangementStartOperation,
  setAudioParameters,
  handleWarpMarkerOperation,
} from "./update-clip-helpers.js";
import { handleArrangementLengthOperation } from "./arrangement-operations.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";

/**
 * Updates properties of existing clips
 * @param {Object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.modulations] - Modulation expressions (parameter: expression per line)
 * @param {string} [args.noteUpdateMode="merge"] - How to handle existing notes: 'replace' or 'merge'
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.start] - Bar|beat position where loop/clip region begins
 * @param {string} [args.length] - Duration in bar:beat format. end = start + length
 * @param {string} [args.firstStart] - Bar|beat position for initial playback start (only needed when different from start)
 * @param {boolean} [args.looping] - Enable looping for the clip
 * @param {string} [args.arrangementStart] - Bar|beat position to move arrangement clip (arrangement clips only)
 * @param {string} [args.arrangementLength] - Bar:beat duration for arrangement span (supports shortening, hidden content exposure, and tiling)
 * @param {number} [args.gainDb] - Audio clip gain in decibels (-70 to 24)
 * @param {number} [args.pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @param {string} [args.warpMode] - Audio clip warp mode: beats, tones, texture, repitch, complex, rex, pro
 * @param {boolean} [args.warping] - Audio clip warping on/off
 * @returns {Object|Array<Object>} Single clip object or array of clip objects
 */
export function updateClip(
  {
    ids,
    notes: notationString,
    modulations: modulationString,
    noteUpdateMode = "merge",
    name,
    color,
    timeSignature,
    start,
    length,
    firstStart,
    looping,
    arrangementStart,
    arrangementLength,
    gainDb,
    pitchShift,
    warpMode,
    warping,
    warpOp,
    warpBeatTime,
    warpSampleTime,
    warpDistance,
  } = {},
  context = {
    holdingAreaStartBeats: 40000,
  },
) {
  if (!ids) {
    throw new Error("updateClip failed: ids is required");
  }

  // Parse comma-separated string into array
  const clipIds = parseCommaSeparatedIds(ids);

  // Validate all IDs are clips, skip invalid ones
  const clips = validateIdTypes(clipIds, "clip", "updateClip", {
    skipInvalid: true,
  });

  // Get song time signature for arrangementStart/arrangementLength conversion
  let songTimeSigNumerator, songTimeSigDenominator;
  let arrangementStartBeats = null;
  let arrangementLengthBeats = null;

  if (arrangementStart != null || arrangementLength != null) {
    const songTimeSig = parseSongTimeSignature();
    songTimeSigNumerator = songTimeSig.numerator;
    songTimeSigDenominator = songTimeSig.denominator;

    if (arrangementStart != null) {
      arrangementStartBeats = barBeatToAbletonBeats(
        arrangementStart,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    }

    if (arrangementLength != null) {
      arrangementLengthBeats = barBeatDurationToAbletonBeats(
        arrangementLength,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );

      if (arrangementLengthBeats <= 0) {
        throw new Error("arrangementLength must be greater than 0");
      }
    }
  }

  const updatedClips = [];

  // Track which tracks have multiple clips being moved (for overlap warning)
  const tracksWithMovedClips = new Map(); // trackIndex -> count

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

    // Calculate beat positions using helper
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
      currentLoopEnd: currentLoopEnd,
    });

    clip.setAll(propsToSet);

    // Audio-specific parameters (only for audio clips)
    const isAudioClip = clip.getProperty("is_audio_clip") > 0;
    if (isAudioClip) {
      setAudioParameters(clip, { gainDb, pitchShift, warpMode, warping });
    }

    // Handle note updates using helper
    finalNoteCount = handleNoteUpdates(
      clip,
      notationString,
      modulationString,
      noteUpdateMode,
      timeSigNumerator,
      timeSigDenominator,
    );

    // Handle warp marker operations (audio clips only)
    if (warpOp != null) {
      handleWarpMarkerOperation(
        clip,
        warpOp,
        warpBeatTime,
        warpSampleTime,
        warpDistance,
      );
    }

    // Handle arrangementLength (shortening, hidden content exposure, and tiling)
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

    // Handle arrangementStart (move clip) after all property updates
    let finalClipId = clip.id;
    if (arrangementStartBeats != null) {
      finalClipId = handleArrangementStartOperation({
        clip,
        arrangementStartBeats,
        tracksWithMovedClips,
      });
    }

    // Build optimistic result object only if arrangementLength didn't return results
    if (!hasArrangementLengthResults) {
      const clipResult = {
        id: finalClipId,
      };

      // Only include noteCount if notes were modified
      if (finalNoteCount != null) {
        clipResult.noteCount = finalNoteCount;
      }

      updatedClips.push(clipResult);
    }
  }

  // Emit warning if multiple clips from same track were moved to same position
  if (arrangementStartBeats != null) {
    for (const [trackIndex, count] of tracksWithMovedClips.entries()) {
      if (count > 1) {
        console.error(
          `Warning: ${count} clips on track ${trackIndex} moved to the same position - later clips will overwrite earlier ones`,
        );
      }
    }
  }

  // Return single object if one valid result, array for multiple results or empty array for none
  if (updatedClips.length === 0) {
    return [];
  }
  return updatedClips.length === 1 ? updatedClips[0] : updatedClips;
}
