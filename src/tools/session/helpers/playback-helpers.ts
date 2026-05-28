// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { resolveLocatorRefToBeats } from "#src/tools/shared/locator/locator-helpers.ts";

interface LoopState {
  startBeats: number;
  start: string;
  end: string;
}

interface StartTimeParams {
  startTime?: string;
  startLocator?: string;
}

interface LoopStartParams {
  loopStart?: string;
  loopStartLocator?: string;
}

interface LoopEndParams {
  loopEnd?: string;
  loopEndLocator?: string;
}

interface ResolvedStartTime {
  startTimeBeats?: number;
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
 * Resolve a locator reference to its time in beats
 * @param liveSet - The live_set LiveAPI object
 * @param locator - Locator ID or name
 * @param paramName - Name of the parameter for error messages
 * @returns Time in beats or undefined if no locator specified
 */
export function resolveLocatorToBeats(
  liveSet: LiveAPI,
  locator: string | undefined,
  paramName: string,
): number | undefined {
  if (locator == null) {
    return;
  }

  return resolveLocatorRefToBeats(
    liveSet,
    locator,
    "playback",
    `for ${paramName}`,
  );
}

/**
 * Validate mutual exclusivity of time and locator parameters
 * @param timeParam - Time parameter value
 * @param locatorParam - Locator parameter value
 * @param paramName - Name of the parameter for error messages
 */
export function validateLocatorOrTime(
  timeParam: string | undefined,
  locatorParam: string | undefined,
  paramName: string,
): void {
  if (timeParam != null && locatorParam != null) {
    const locatorParamBase = paramName.replace(/Time$/, "");

    throw new Error(
      `playback failed: ${paramName} cannot be used with ${locatorParamBase}Locator`,
    );
  }
}

/**
 * Resolve start time from either bar|beat string or locator reference
 * @param liveSet - The live_set LiveAPI object
 * @param params - Start time parameters
 * @param params.startTime - Bar|beat position
 * @param params.startLocator - Locator ID or name for start
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Resolved start time
 */
export function resolveStartTime(
  liveSet: LiveAPI,
  { startTime, startLocator }: StartTimeParams,
  timeSigNumerator: number,
  timeSigDenominator: number,
): ResolvedStartTime {
  const useLocatorStart = startLocator != null;
  let startTimeBeats: number | undefined;

  if (startTime != null) {
    startTimeBeats = barBeatToAbletonBeats(
      startTime,
      timeSigNumerator,
      timeSigDenominator,
    );
    liveSet.set("start_time", startTimeBeats);
  } else if (useLocatorStart) {
    startTimeBeats = resolveLocatorToBeats(liveSet, startLocator, "start");
    liveSet.set("start_time", startTimeBeats);
  }

  return { startTimeBeats, useLocatorStart };
}

/**
 * Resolve loop start time from either bar|beat string or locator reference
 * @param liveSet - The live_set LiveAPI object
 * @param params - Loop start parameters
 * @param params.loopStart - Bar|beat position
 * @param params.loopStartLocator - Locator ID or name for loop start
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Resolved loop start in beats
 */
export function resolveLoopStart(
  liveSet: LiveAPI,
  { loopStart, loopStartLocator }: LoopStartParams,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number | undefined {
  let loopStartBeats: number | undefined;

  if (loopStart != null) {
    loopStartBeats = barBeatToAbletonBeats(
      loopStart,
      timeSigNumerator,
      timeSigDenominator,
    );
    liveSet.set("loop_start", loopStartBeats);
  } else if (loopStartLocator != null) {
    loopStartBeats = resolveLocatorToBeats(
      liveSet,
      loopStartLocator,
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
 * @param params.loopEndLocator - Locator ID or name for loop end
 * @param loopStartBeats - Resolved loop start in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 */
export function resolveLoopEnd(
  liveSet: LiveAPI,
  { loopEnd, loopEndLocator }: LoopEndParams,
  loopStartBeats: number | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  let loopEndBeats: number | undefined;

  if (loopEnd != null) {
    loopEndBeats = barBeatToAbletonBeats(
      loopEnd,
      timeSigNumerator,
      timeSigDenominator,
    );
  } else if (loopEndLocator != null) {
    loopEndBeats = resolveLocatorToBeats(liveSet, loopEndLocator, "loopEnd");
  }

  if (loopEndBeats != null) {
    const actualLoopStartBeats =
      loopStartBeats ?? (liveSet.getProperty("loop_start") as number);
    const loopLengthBeats = loopEndBeats - actualLoopStartBeats;

    liveSet.set("loop_length", loopLengthBeats);
  }
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTimeBeats: number;
}

/**
 * Handle playing the arrangement view
 * @param liveSet - LiveAPI instance for live_set
 * @param startTime - Start time in bar|beat format
 * @param startTimeBeats - Start time in beats (from time or locator)
 * @param useLocatorStart - Whether start position came from a locator
 * @param _state - Current playback state (unused)
 * @returns Updated playback state
 */
export function handlePlayArrangement(
  liveSet: LiveAPI,
  startTime: string | undefined,
  startTimeBeats: number | undefined,
  useLocatorStart: boolean,
  _state: PlaybackState,
): PlaybackState {
  let resolvedStartTimeBeats = startTimeBeats;

  if (startTime == null && !useLocatorStart) {
    liveSet.set("start_time", 0);
    resolvedStartTimeBeats = 0;
  }

  liveSet.set("back_to_arranger", 0);
  liveSet.call("start_playing");

  return {
    isPlaying: true,
    currentTimeBeats: resolvedStartTimeBeats ?? 0,
  };
}

/**
 * Handle playing a scene in session view
 * @param sceneIndex - Scene index to play
 * @param state - Current playback state
 * @returns Updated playback state
 */
export function handlePlayScene(
  sceneIndex: number | undefined,
  state: PlaybackState,
): PlaybackState {
  if (sceneIndex == null) {
    throw new Error(
      `playback failed: sceneIndex is required for action "play-scene"`,
    );
  }

  const scene = LiveAPI.from(livePath.scene(sceneIndex));

  if (!scene.exists()) {
    throw new Error(
      `playback failed: scene at index ${sceneIndex} does not exist`,
    );
  }

  scene.call("fire");

  return {
    isPlaying: true,
    currentTimeBeats: state.currentTimeBeats,
  };
}
