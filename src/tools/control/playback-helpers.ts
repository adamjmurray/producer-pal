import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.js";
import {
  findLocator,
  findLocatorsByName,
} from "#src/tools/shared/locator/locator-helpers.js";

interface LoopState {
  startBeats: number;
  start: string;
  end: string;
}

interface LocatorOptions {
  locatorId?: string;
  locatorName?: string;
}

interface StartTimeParams {
  startTime?: string;
  startLocatorId?: string;
  startLocatorName?: string;
}

interface LoopStartParams {
  loopStart?: string;
  loopStartLocatorId?: string;
  loopStartLocatorName?: string;
}

interface LoopEndParams {
  loopEnd?: string;
  loopEndLocatorId?: string;
  loopEndLocatorName?: string;
}

interface ResolvedStartTime {
  startTimeBeats: number | null | undefined;
  useLocatorStart: boolean;
}

/**
 * Get the current loop state from liveSet
 * @param liveSet - The live_set LiveAPI object
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Loop state
 */
export function getCurrentLoopState(
  liveSet: LiveAPI,
  timeSigNumerator: number,
  timeSigDenominator: number,
): LoopState {
  const startBeats = liveSet.getProperty("loop_start") as number;
  const lengthBeats = liveSet.getProperty("loop_length") as number;
  const start = abletonBeatsToBarBeat(
    startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  const end = abletonBeatsToBarBeat(
    startBeats + lengthBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  return { startBeats, start, end };
}

/**
 * Resolve a locator by ID or name to its time in beats
 * @param liveSet - The live_set LiveAPI object
 * @param options - Locator identifier options
 * @param options.locatorId - Locator ID to find
 * @param options.locatorName - Locator name to find
 * @param paramName - Name of the parameter for error messages
 * @returns Time in beats or null if no locator specified
 */
export function resolveLocatorToBeats(
  liveSet: LiveAPI,
  { locatorId, locatorName }: LocatorOptions,
  paramName: string,
): number | null {
  if (locatorId != null) {
    const found = findLocator(liveSet, { locatorId });

    if (!found) {
      throw new Error(`playback failed: locator not found: ${locatorId}`);
    }

    return found.locator.getProperty("time") as number;
  }

  if (locatorName != null) {
    const matches = findLocatorsByName(liveSet, locatorName);

    if (matches.length === 0) {
      throw new Error(
        `playback failed: no locator found with name "${locatorName}" for ${paramName}`,
      );
    }

    // Array is guaranteed non-empty after the length check above
    const firstMatch = matches[0];

    // TypeScript doesn't narrow based on length checks, so we add this guard
    if (firstMatch === undefined) {
      throw new Error("playback failed: unexpected empty array after check");
    }

    return firstMatch.time;
  }

  return null;
}

/**
 * Validate mutual exclusivity of time and locator parameters
 * @param timeParam - Time parameter value
 * @param locatorIdParam - Locator ID parameter value
 * @param locatorNameParam - Locator name parameter value
 * @param paramName - Name of the parameter for error messages
 */
export function validateLocatorOrTime(
  timeParam: string | undefined,
  locatorIdParam: string | undefined,
  locatorNameParam: string | undefined,
  paramName: string,
): void {
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
 * @param liveSet - The live_set LiveAPI object
 * @param params - Start time parameters
 * @param params.startTime - Bar|beat position
 * @param params.startLocatorId - Locator ID for start
 * @param params.startLocatorName - Locator name for start
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Resolved start time
 */
export function resolveStartTime(
  liveSet: LiveAPI,
  { startTime, startLocatorId, startLocatorName }: StartTimeParams,
  timeSigNumerator: number,
  timeSigDenominator: number,
): ResolvedStartTime {
  const useLocatorStart = startLocatorId != null || startLocatorName != null;
  let startTimeBeats: number | null | undefined;

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
 * @param liveSet - The live_set LiveAPI object
 * @param params - Loop start parameters
 * @param params.loopStart - Bar|beat position
 * @param params.loopStartLocatorId - Locator ID for loop start
 * @param params.loopStartLocatorName - Locator name for loop start
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Resolved loop start in beats
 */
export function resolveLoopStart(
  liveSet: LiveAPI,
  { loopStart, loopStartLocatorId, loopStartLocatorName }: LoopStartParams,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number | null | undefined {
  let loopStartBeats: number | null | undefined;

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
 * @param liveSet - The live_set LiveAPI object
 * @param params - Loop end parameters
 * @param params.loopEnd - Bar|beat position
 * @param params.loopEndLocatorId - Locator ID for loop end
 * @param params.loopEndLocatorName - Locator name for loop end
 * @param loopStartBeats - Resolved loop start in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 */
export function resolveLoopEnd(
  liveSet: LiveAPI,
  { loopEnd, loopEndLocatorId, loopEndLocatorName }: LoopEndParams,
  loopStartBeats: number | null | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  let loopEndBeats: number | null | undefined;

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
      loopStartBeats ?? (liveSet.getProperty("loop_start") as number);
    const loopLengthBeats = loopEndBeats - actualLoopStartBeats;

    liveSet.set("loop_length", loopLengthBeats);
  }
}

/**
 * Get track IDs that are currently following the arrangement
 * @param liveSet - The live_set LiveAPI object
 * @returns Comma-separated list of track IDs following arrangement
 */
export function getArrangementFollowerTrackIds(liveSet: LiveAPI): string {
  const trackIds = liveSet.getChildIds("tracks");

  return trackIds
    .filter((trackId) => {
      const track = LiveAPI.from(trackId);

      return track.exists() && track.getProperty("back_to_arranger") === 0;
    })
    .map((trackId) => trackId.replace("id ", ""))
    .join(",");
}
