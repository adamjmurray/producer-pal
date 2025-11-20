import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import * as console from "../../shared/v8-max-console.js";

/**
 * Parse song time signature from live_set
 * @returns {{numerator: number, denominator: number}} Time signature components
 */
function parseSongTimeSignature() {
  const liveSet = new LiveAPI("live_set");
  return {
    numerator: liveSet.getProperty("signature_numerator"),
    denominator: liveSet.getProperty("signature_denominator"),
  };
}

/**
 * Validate and parse arrangement parameters
 * @param {string} arrangementStart - Bar|beat position for arrangement clip start
 * @param {string} arrangementLength - Bar:beat duration for arrangement span
 * @returns {object} Parsed parameters: songTimeSigNumerator, songTimeSigDenominator, arrangementStartBeats, arrangementLengthBeats
 */
export function validateAndParseArrangementParams(
  arrangementStart,
  arrangementLength,
) {
  const result = {
    songTimeSigNumerator: null,
    songTimeSigDenominator: null,
    arrangementStartBeats: null,
    arrangementLengthBeats: null,
  };

  if (arrangementStart == null && arrangementLength == null) {
    return result;
  }

  const songTimeSig = parseSongTimeSignature();
  result.songTimeSigNumerator = songTimeSig.numerator;
  result.songTimeSigDenominator = songTimeSig.denominator;

  if (arrangementStart != null) {
    result.arrangementStartBeats = barBeatToAbletonBeats(
      arrangementStart,
      result.songTimeSigNumerator,
      result.songTimeSigDenominator,
    );
  }

  if (arrangementLength != null) {
    result.arrangementLengthBeats = barBeatDurationToAbletonBeats(
      arrangementLength,
      result.songTimeSigNumerator,
      result.songTimeSigDenominator,
    );

    if (result.arrangementLengthBeats <= 0) {
      throw new Error("arrangementLength must be greater than 0");
    }
  }

  return result;
}

/**
 * Build clip result object with optional noteCount
 * @param {string} clipId - The clip ID
 * @param {number|null} noteCount - Optional final note count
 * @returns {object} Result object with id and optionally noteCount
 */
export function buildClipResultObject(clipId, noteCount) {
  const result = { id: clipId };
  if (noteCount != null) {
    result.noteCount = noteCount;
  }
  return result;
}

/**
 * Emit warnings for clips moved to same track position
 * @param {number|null} arrangementStartBeats - Whether arrangement start was set
 * @param {Map} tracksWithMovedClips - Map of trackIndex to clip count
 */
export function emitArrangementWarnings(
  arrangementStartBeats,
  tracksWithMovedClips,
) {
  if (arrangementStartBeats == null) {
    return;
  }

  for (const [trackIndex, count] of tracksWithMovedClips.entries()) {
    if (count > 1) {
      console.error(
        `Warning: ${count} clips on track ${trackIndex} moved to the same position - later clips will overwrite earlier ones`,
      );
    }
  }
}
