import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.js";
import { resolveLocatorToBeats } from "#src/tools/shared/locator/locator-helpers.js";
import { buildIndexedName } from "#src/tools/shared/utils.js";
import {
  parseSceneIndexList,
  parseArrangementStartList,
} from "#src/tools/shared/validation/position-parsing.js";
import {
  duplicateClipSlot,
  duplicateClipToArrangement,
} from "./duplicate-helpers.js";

/**
 * Duplicates a clip to explicit positions
 * @param {string} destination - Destination for clip duplication (session or arrangement)
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {string} name - Base name for duplicated clips
 * @param {number} toTrackIndex - Destination track index
 * @param {string} toSceneIndex - Comma-separated scene indices for session clips
 * @param {string} arrangementStart - Comma-separated bar|beat positions for arrangement
 * @param {string} arrangementLocatorId - Locator ID for arrangement position
 * @param {string} arrangementLocatorName - Locator name for arrangement position
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
  arrangementLocatorId,
  arrangementLocatorName,
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
      const objectName = buildIndexedName(name, sceneIndices.length, i);
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
    const liveSet = LiveAPI.from("live_set");
    const songTimeSigNumerator = /** @type {number} */ (
      liveSet.getProperty("signature_numerator")
    );
    const songTimeSigDenominator = /** @type {number} */ (
      liveSet.getProperty("signature_denominator")
    );

    // Resolve positions from locator (single) or bar|beat (multiple)
    const positionsInBeats = resolveClipArrangementPositions(
      liveSet,
      arrangementStart,
      arrangementLocatorId,
      arrangementLocatorName,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

    for (let i = 0; i < positionsInBeats.length; i++) {
      const objectName = buildIndexedName(name, positionsInBeats.length, i);
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
 * Resolves clip arrangement positions from bar|beat or locator
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {string} arrangementStart - Comma-separated bar|beat positions
 * @param {string} arrangementLocatorId - Locator ID for position
 * @param {string} arrangementLocatorName - Locator name for position
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number[]} Array of positions in beats
 */
function resolveClipArrangementPositions(
  liveSet,
  arrangementStart,
  arrangementLocatorId,
  arrangementLocatorName,
  timeSigNumerator,
  timeSigDenominator,
) {
  // Locator-based: single position
  if (arrangementLocatorId != null || arrangementLocatorName != null) {
    const locatorBeats = resolveLocatorToBeats(
      liveSet,
      { locatorId: arrangementLocatorId, locatorName: arrangementLocatorName },
      "duplicate",
    );

    return [locatorBeats];
  }

  // Bar|beat positions: multiple positions supported
  const positions = parseArrangementStartList(arrangementStart);

  return positions.map((pos) =>
    barBeatToAbletonBeats(pos, timeSigNumerator, timeSigDenominator),
  );
}
