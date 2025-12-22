import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.js";
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
    const positions = parseArrangementStartList(arrangementStart);
    const liveSet = new LiveAPI("live_set");
    const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

    for (let i = 0; i < positions.length; i++) {
      const objectName = generateClipName(name, positions.length, i);
      const arrangementStartBeats = barBeatToAbletonBeats(
        positions[i],
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
      const result = duplicateClipToArrangement(
        id,
        arrangementStartBeats,
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
