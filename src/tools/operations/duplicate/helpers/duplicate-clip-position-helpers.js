import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.js";
import { resolveCueToBeats } from "#src/tools/shared/cue/cue-helpers.js";
import {
  parseSceneIndexList,
  parseArrangementStartList,
} from "#src/tools/shared/validation/position-parsing.js";
import {
  duplicateClipSlot,
  duplicateClipToArrangement,
} from "./duplicate-helpers.js";

/**
 * Generates a name for a duplicated clip
 * @param {string} baseName - Base name for the clip
 * @param {number} count - Total number of duplicates
 * @param {number} index - Current duplicate index
 * @returns {string | undefined} Generated name or undefined
 */
function generateClipName(baseName, count, index) {
  if (baseName == null) {
    return undefined;
  }

  if (count === 1) {
    return baseName;
  }

  if (index === 0) {
    return baseName;
  }

  return `${baseName} ${index + 1}`;
}

/**
 * Duplicates a clip to explicit positions
 * @param {string} destination - Destination for clip duplication (session or arrangement)
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {string} name - Base name for duplicated clips
 * @param {number} toTrackIndex - Destination track index
 * @param {string} toSceneIndex - Comma-separated scene indices for session clips
 * @param {string} arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param {string} arrangementCueId - Cue ID for arrangement position
 * @param {string} arrangementCueName - Cue name for arrangement position
 * @param {string} arrangementLength - Duration in bar|beat format
 * @param {object} context - Context object with holdingAreaStartBeats
 * @returns {Array<object>} Array of result objects
 */
export function duplicateClipWithPositions(
  destination,
  object,
  id,
  name,
  toTrackIndex,
  toSceneIndex,
  arrangementStart,
  arrangementCueId,
  arrangementCueName,
  arrangementLength,
  context,
) {
  const createdObjects = [];

  if (destination === "session") {
    const sceneIndices = parseSceneIndexList(toSceneIndex);
    const trackIndex = object.trackIndex;
    const sourceSceneIndex = object.sceneIndex;

    if (trackIndex == null || sourceSceneIndex == null) {
      throw new Error(
        `unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="${id}" path="${object.path}") `,
      );
    }

    for (let i = 0; i < sceneIndices.length; i++) {
      const objectName = generateClipName(name, sceneIndices.length, i);
      const result = duplicateClipSlot(
        trackIndex,
        sourceSceneIndex,
        toTrackIndex,
        sceneIndices[i],
        objectName,
      );

      createdObjects.push(result);
    }
  } else {
    // Arrangement destination
    const liveSet = new LiveAPI("live_set");
    const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

    // Resolve positions from cue (single) or bar|beat (multiple)
    const positionsInBeats = resolveClipArrangementPositions(
      liveSet,
      arrangementStart,
      arrangementCueId,
      arrangementCueName,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

    for (let i = 0; i < positionsInBeats.length; i++) {
      const objectName = generateClipName(name, positionsInBeats.length, i);
      const result = duplicateClipToArrangement(
        id,
        positionsInBeats[i],
        objectName,
        arrangementLength,
        songTimeSigNumerator,
        songTimeSigDenominator,
        context,
      );

      createdObjects.push(result);
    }
  }

  return createdObjects;
}

/**
 * Resolves clip arrangement positions from bar|beat or cue
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {string} arrangementStart - Comma-separated bar|beat positions
 * @param {string} arrangementCueId - Cue ID for position
 * @param {string} arrangementCueName - Cue name for position
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number[]} Array of positions in beats
 */
function resolveClipArrangementPositions(
  liveSet,
  arrangementStart,
  arrangementCueId,
  arrangementCueName,
  timeSigNumerator,
  timeSigDenominator,
) {
  // Cue-based: single position
  if (arrangementCueId != null || arrangementCueName != null) {
    const cueBeats = resolveCueToBeats(
      liveSet,
      { cueId: arrangementCueId, cueName: arrangementCueName },
      "duplicate",
    );

    return [cueBeats];
  }

  // Bar|beat positions: multiple positions supported
  const positions = parseArrangementStartList(arrangementStart);

  return positions.map((pos) =>
    barBeatToAbletonBeats(pos, timeSigNumerator, timeSigDenominator),
  );
}
