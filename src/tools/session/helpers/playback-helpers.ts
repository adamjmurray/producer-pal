// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { sceneDisplayName } from "#src/tools/scene/scene-helpers.ts";
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

/** The params that address the arrangement timeline: the playhead and the loop. */
export interface ArrangementParams
  extends StartTimeParams, LoopStartParams, LoopEndParams {
  loop?: boolean;
}

/** The actions that read the arrangement timeline. The rest work the session. */
const ARRANGEMENT_ACTIONS = new Set(["play-arrangement", "update-arrangement"]);

/**
 * Drop the arrangement-timeline params on an action that doesn't use them.
 *
 * These are written to the Live Set before the action runs, so a session action
 * used to apply them anyway: "play scene 3 from bar 5" fired the scene and moved
 * the arrangement playhead, without a word. The scene had nothing to do with the
 * arrangement, so the caller got a change to their Live Set they never asked for.
 * @param action - The playback action, which decides whether they apply
 * @param params - The timeline params as the caller sent them
 * @returns The params, or none of them when the action works the session
 */
export function resolveArrangementParams(
  action: string,
  params: ArrangementParams,
): ArrangementParams {
  if (ARRANGEMENT_ACTIONS.has(action)) return params;

  const sent = (Object.keys(params) as Array<keyof ArrangementParams>).filter(
    (key) => params[key] != null,
  );

  if (sent.length > 0) {
    console.warn(
      `${sent.join("/")} ignored: action "${action}" doesn't take arrangement ` +
        `timeline params; use "play-arrangement" or "update-arrangement" for ` +
        `the playhead and loop`,
    );
  }

  return {};
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
    return undefined;
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
 * Refuse a timeline whose position is named twice — once as a bar|beat and
 * once as a locator. All three positions get the same rule.
 * @param timeline - The arrangement params this action kept
 */
export function validateTimelineParams(timeline: ArrangementParams): void {
  validateLocatorOrTime(timeline.startTime, timeline.startLocator, "startTime");
  validateLocatorOrTime(
    timeline.loopStart,
    timeline.loopStartLocator,
    "loopStart",
  );
  validateLocatorOrTime(timeline.loopEnd, timeline.loopEndLocator, "loopEnd");
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
    validateBarBeatPosition(startTime);
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
    validateBarBeatPosition(loopStart);
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
    validateBarBeatPosition(loopEnd);
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

    // loopStart and loopEnd are independent params, so loopEnd can land at or
    // before loopStart. A non-positive loop_length is invalid in Live; warn and
    // skip rather than writing it.
    if (loopLengthBeats <= 0) {
      console.warn(
        `loopEnd must be after loopStart: loop length ${loopLengthBeats} beats (loopStart ${actualLoopStartBeats}, loopEnd ${loopEndBeats}) — skipping loop length update`,
      );

      return;
    }

    liveSet.set("loop_length", loopLengthBeats);
  }
}

/** The scene play-scene fired, for the response */
export interface FiredScene {
  sceneIndex: number;
  sceneName: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTimeBeats: number;
  /**
   * Set by play-scene only. The scene can be named by a scene id or by a clip
   * in it, so the caller doesn't always know which one fired.
   */
  scene?: FiredScene;
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
      `playback failed: path "s<scene>" or a scene id is required for action "play-scene"`,
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
    scene: { sceneIndex, sceneName: sceneDisplayName(scene, sceneIndex) },
  };
}
