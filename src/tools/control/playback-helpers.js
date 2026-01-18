import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.js";
import {
  findLocator,
  findLocatorsByName,
} from "#src/tools/shared/locator/locator-helpers.js";

/**
 * Resolve a locator by ID or name to its time in beats
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Locator identifier options
 * @param {string} [options.locatorId] - Locator ID to find
 * @param {string} [options.locatorName] - Locator name to find
 * @param {string} paramName - Name of the parameter for error messages
 * @returns {number|null} Time in beats or null if no locator specified
 */
export function resolveLocatorToBeats(
  liveSet,
  { locatorId, locatorName },
  paramName,
) {
  if (locatorId != null) {
    const found = findLocator(liveSet, { locatorId });

    if (!found) {
      throw new Error(`playback failed: locator not found: ${locatorId}`);
    }

    return /** @type {number} */ (found.locator.getProperty("time"));
  }

  if (locatorName != null) {
    const matches = findLocatorsByName(liveSet, locatorName);

    if (matches.length === 0) {
      throw new Error(
        `playback failed: no locator found with name "${locatorName}" for ${paramName}`,
      );
    }

    // Use the first matching locator
    return matches[0].time;
  }

  return null;
}

/**
 * Validate mutual exclusivity of time and locator parameters
 * @param {string} timeParam - Time parameter value
 * @param {string} locatorIdParam - Locator ID parameter value
 * @param {string} locatorNameParam - Locator name parameter value
 * @param {string} paramName - Name of the parameter for error messages
 */
export function validateLocatorOrTime(
  timeParam,
  locatorIdParam,
  locatorNameParam,
  paramName,
) {
  const hasTime = timeParam != null;
  const hasLocatorId = locatorIdParam != null;
  const hasLocatorName = locatorNameParam != null;

  // Compute base name for locator parameters (strip "Time" suffix if present)
  // e.g., "startTime" → "start", "loopStart" → "loopStart"
  const locatorParamBase = paramName.replace(/Time$/, "");

  if (hasTime && (hasLocatorId || hasLocatorName)) {
    throw new Error(
      `playback failed: ${paramName} cannot be used with ${locatorParamBase}LocatorId or ${locatorParamBase}LocatorName`,
    );
  }

  if (hasLocatorId && hasLocatorName) {
    throw new Error(
      `playback failed: ${locatorParamBase}LocatorId and ${locatorParamBase}LocatorName are mutually exclusive`,
    );
  }
}

/**
 * Resolve start time from either bar|beat string, locator ID, or locator name
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} params - Start time parameters
 * @param {string} [params.startTime] - Bar|beat position
 * @param {string} [params.startLocatorId] - Locator ID for start
 * @param {string} [params.startLocatorName] - Locator name for start
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {{startTimeBeats: number|undefined, useLocatorStart: boolean}} Resolved start time
 */
export function resolveStartTime(
  liveSet,
  { startTime, startLocatorId, startLocatorName },
  timeSigNumerator,
  timeSigDenominator,
) {
  const useLocatorStart = startLocatorId != null || startLocatorName != null;
  let startTimeBeats;

  if (startTime != null) {
    startTimeBeats = barBeatToAbletonBeats(
      startTime,
      timeSigNumerator,
      timeSigDenominator,
    );
    liveSet.set("start_time", startTimeBeats);
  } else if (useLocatorStart) {
    startTimeBeats = resolveLocatorToBeats(
      liveSet,
      { locatorId: startLocatorId, locatorName: startLocatorName },
      "start",
    );
    liveSet.set("start_time", startTimeBeats);
  }

  return { startTimeBeats, useLocatorStart };
}

/**
 * Resolve loop start time from either bar|beat string, locator ID, or locator name
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} params - Loop start parameters
 * @param {string} [params.loopStart] - Bar|beat position
 * @param {string} [params.loopStartLocatorId] - Locator ID for loop start
 * @param {string} [params.loopStartLocatorName] - Locator name for loop start
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number|undefined} Resolved loop start in beats
 */
export function resolveLoopStart(
  liveSet,
  { loopStart, loopStartLocatorId, loopStartLocatorName },
  timeSigNumerator,
  timeSigDenominator,
) {
  let loopStartBeats;

  if (loopStart != null) {
    loopStartBeats = barBeatToAbletonBeats(
      loopStart,
      timeSigNumerator,
      timeSigDenominator,
    );
    liveSet.set("loop_start", loopStartBeats);
  } else if (loopStartLocatorId != null || loopStartLocatorName != null) {
    loopStartBeats = resolveLocatorToBeats(
      liveSet,
      { locatorId: loopStartLocatorId, locatorName: loopStartLocatorName },
      "loopStart",
    );
    liveSet.set("loop_start", loopStartBeats);
  }

  return loopStartBeats;
}

/**
 * Resolve loop end time and set loop length
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} params - Loop end parameters
 * @param {string} [params.loopEnd] - Bar|beat position
 * @param {string} [params.loopEndLocatorId] - Locator ID for loop end
 * @param {string} [params.loopEndLocatorName] - Locator name for loop end
 * @param {number|undefined} loopStartBeats - Resolved loop start in beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 */
export function resolveLoopEnd(
  liveSet,
  { loopEnd, loopEndLocatorId, loopEndLocatorName },
  loopStartBeats,
  timeSigNumerator,
  timeSigDenominator,
) {
  let loopEndBeats;

  if (loopEnd != null) {
    loopEndBeats = barBeatToAbletonBeats(
      loopEnd,
      timeSigNumerator,
      timeSigDenominator,
    );
  } else if (loopEndLocatorId != null || loopEndLocatorName != null) {
    loopEndBeats = resolveLocatorToBeats(
      liveSet,
      { locatorId: loopEndLocatorId, locatorName: loopEndLocatorName },
      "loopEnd",
    );
  }

  if (loopEndBeats != null) {
    const actualLoopStartBeats =
      loopStartBeats ??
      /** @type {number} */ (liveSet.getProperty("loop_start"));
    const loopLengthBeats = loopEndBeats - actualLoopStartBeats;

    liveSet.set("loop_length", loopLengthBeats);
  }
}

/**
 * Get track IDs that are currently following the arrangement
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @returns {string} Comma-separated list of track IDs following arrangement
 */
export function getArrangementFollowerTrackIds(liveSet) {
  const trackIds = liveSet.getChildIds("tracks");

  return trackIds
    .filter((trackId) => {
      const track = LiveAPI.from(trackId);

      return track.exists() && track.getProperty("back_to_arranger") === 0;
    })
    .map((trackId) => trackId.replace("id ", ""))
    .join(",");
}
