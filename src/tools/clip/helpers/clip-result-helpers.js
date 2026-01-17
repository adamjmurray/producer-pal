// @ts-nocheck -- TODO: Add JSDoc type annotations
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.js";
import * as console from "#src/shared/v8-max-console.js";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.js";
import { parseSongTimeSignature } from "#src/tools/shared/live-set-helpers.js";

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

/**
 * Prepare a session clip slot, auto-creating scenes if needed
 * @param {number} trackIndex - Track index (0-based)
 * @param {number} sceneIndex - Target scene index (0-based)
 * @param {LiveAPI} liveSet - LiveAPI liveSet object
 * @param {number} maxAutoCreatedScenes - Maximum number of scenes allowed
 * @returns {LiveAPI} The clip slot ready for clip creation
 */
export function prepareSessionClipSlot(
  trackIndex,
  sceneIndex,
  liveSet,
  maxAutoCreatedScenes,
) {
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
      liveSet.call("create_scene", -1);
    }
  }

  const clipSlot = LiveAPI.from(
    `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
  );

  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `a clip already exists at track ${trackIndex}, clip slot ${sceneIndex}`,
    );
  }

  return clipSlot;
}
