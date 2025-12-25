import { barBeatToAbletonBeats } from "../../notation/barbeat/time/barbeat-time.js";
import { findCue, findCuesByName } from "../shared/cue/cue-helpers.js";

/**
 * Resolve a cue by ID or name to its time in beats
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Cue identifier options
 * @param {string} [options.cueId] - Cue ID to find
 * @param {string} [options.cueName] - Cue name to find
 * @param {string} paramName - Name of the parameter for error messages
 * @returns {number|null} Time in beats or null if no cue specified
 */
export function resolveCueToBeats(liveSet, { cueId, cueName }, paramName) {
  if (cueId != null) {
    const found = findCue(liveSet, { cueId });

    if (!found) {
      throw new Error(`playback failed: cue not found: ${cueId}`);
    }

    return found.cue.getProperty("time");
  }

  if (cueName != null) {
    const matches = findCuesByName(liveSet, cueName);

    if (matches.length === 0) {
      throw new Error(
        `playback failed: no cue found with name "${cueName}" for ${paramName}`,
      );
    }

    // Use the first matching cue
    return matches[0].time;
  }

  return null;
}

/**
 * Validate mutual exclusivity of time and cue parameters
 * @param {string} timeParam - Time parameter value
 * @param {string} cueIdParam - Cue ID parameter value
 * @param {string} cueNameParam - Cue name parameter value
 * @param {string} paramName - Name of the parameter for error messages
 */
export function validateCueOrTime(
  timeParam,
  cueIdParam,
  cueNameParam,
  paramName,
) {
  const hasTime = timeParam != null;
  const hasCueId = cueIdParam != null;
  const hasCueName = cueNameParam != null;

  if (hasTime && (hasCueId || hasCueName)) {
    throw new Error(
      `playback failed: ${paramName} cannot be used with ${paramName}CueId or ${paramName}CueName`,
    );
  }

  if (hasCueId && hasCueName) {
    throw new Error(
      `playback failed: ${paramName}CueId and ${paramName}CueName are mutually exclusive`,
    );
  }
}

/**
 * Resolve start time from either bar|beat string, cue ID, or cue name
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} params - Start time parameters
 * @param {string} [params.startTime] - Bar|beat position
 * @param {string} [params.startCueId] - Cue ID for start
 * @param {string} [params.startCueName] - Cue name for start
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {{startTimeBeats: number|undefined, useCueStart: boolean}} Resolved start time
 */
export function resolveStartTime(
  liveSet,
  { startTime, startCueId, startCueName },
  timeSigNumerator,
  timeSigDenominator,
) {
  const useCueStart = startCueId != null || startCueName != null;
  let startTimeBeats;

  if (startTime != null) {
    startTimeBeats = barBeatToAbletonBeats(
      startTime,
      timeSigNumerator,
      timeSigDenominator,
    );
    liveSet.set("start_time", startTimeBeats);
  } else if (useCueStart) {
    startTimeBeats = resolveCueToBeats(
      liveSet,
      { cueId: startCueId, cueName: startCueName },
      "start",
    );
    liveSet.set("start_time", startTimeBeats);
  }

  return { startTimeBeats, useCueStart };
}

/**
 * Resolve loop start time from either bar|beat string, cue ID, or cue name
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} params - Loop start parameters
 * @param {string} [params.loopStart] - Bar|beat position
 * @param {string} [params.loopStartCueId] - Cue ID for loop start
 * @param {string} [params.loopStartCueName] - Cue name for loop start
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number|undefined} Resolved loop start in beats
 */
export function resolveLoopStart(
  liveSet,
  { loopStart, loopStartCueId, loopStartCueName },
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
  } else if (loopStartCueId != null || loopStartCueName != null) {
    loopStartBeats = resolveCueToBeats(
      liveSet,
      { cueId: loopStartCueId, cueName: loopStartCueName },
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
 * @param {string} [params.loopEndCueId] - Cue ID for loop end
 * @param {string} [params.loopEndCueName] - Cue name for loop end
 * @param {number|undefined} loopStartBeats - Resolved loop start in beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 */
export function resolveLoopEnd(
  liveSet,
  { loopEnd, loopEndCueId, loopEndCueName },
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
  } else if (loopEndCueId != null || loopEndCueName != null) {
    loopEndBeats = resolveCueToBeats(
      liveSet,
      { cueId: loopEndCueId, cueName: loopEndCueName },
      "loopEnd",
    );
  }

  if (loopEndBeats != null) {
    const actualLoopStartBeats =
      loopStartBeats ?? liveSet.getProperty("loop_start");
    const loopLengthBeats = loopEndBeats - actualLoopStartBeats;

    liveSet.set("loop_length", loopLengthBeats);
  }
}
