// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { sceneDisplayName } from "#src/tools/scene/scene-helpers.ts";
import { songPositionToBeats } from "#src/tools/shared/locator/song-position.ts";

interface LoopState {
  startBeats: number;
  start: string;
  end: string;
}

/** The params that address the arrangement timeline: the playhead and the loop. */
export interface ArrangementParams {
  startTime?: string;
  loop?: boolean;
  loopStart?: string;
  loopEnd?: string;
}

/** The retired params that spelled a position's locator half on its own. */
export interface LegacyLocatorParams {
  startLocator?: string;
  loopStartLocator?: string;
  loopEndLocator?: string;
}

/** Each retired locator param, and the position param it folds into. */
const LOCATOR_PARAM_PAIRS = [
  ["startTime", "startLocator"],
  ["loopStart", "loopStartLocator"],
  ["loopEnd", "loopEndLocator"],
] as const;

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
export function resolveArrangementParams<
  T extends ArrangementParams & LegacyLocatorParams,
>(action: string, params: T): Partial<T> {
  if (ARRANGEMENT_ACTIONS.has(action)) return params;

  const sent = (Object.keys(params) as Array<keyof T>).filter(
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
 * Fold the retired `*Locator` params into the position they belong to. A song
 * position has one spelling now: a bar|beat, or `loc:<name>`.
 * @param params - The timeline params as the caller sent them
 * @returns The same timeline with each locator half folded in
 */
export function foldLocatorParams(
  params: ArrangementParams & LegacyLocatorParams,
): ArrangementParams {
  const folded: ArrangementParams = {
    startTime: params.startTime,
    loop: params.loop,
    loopStart: params.loopStart,
    loopEnd: params.loopEnd,
  };

  for (const [position, legacy] of LOCATOR_PARAM_PAIRS) {
    const locator = params[legacy];

    if (locator == null) continue;

    // Never pick one: the two params name the same position, so a caller who
    // sent both told us two different things about it.
    if (folded[position] != null) {
      throw new Error(
        `playback failed: ${position} cannot be used with ${legacy}`,
      );
    }

    folded[position] = `loc:${locator}`;
  }

  return folded;
}

/**
 * Resolve the arrangement start position and move the playhead there.
 * @param liveSet - The live_set LiveAPI object
 * @param params - The timeline params
 * @param params.startTime - Song position, bar|beat or `loc:<name>`
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns The start position in beats, or undefined when none was given
 */
export function resolveStartTime(
  liveSet: LiveAPI,
  { startTime }: ArrangementParams,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number | undefined {
  if (startTime == null) return undefined;

  const startTimeBeats = songPositionToBeats(liveSet, startTime, {
    toolName: "playback",
    paramName: "startTime",
    timeSigNumerator,
    timeSigDenominator,
  });

  liveSet.set("start_time", startTimeBeats);

  return startTimeBeats;
}

/**
 * Resolve the arrangement loop start and write it.
 * @param liveSet - The live_set LiveAPI object
 * @param params - The timeline params
 * @param params.loopStart - Song position, bar|beat or `loc:<name>`
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns The loop start in beats, or undefined when none was given
 */
export function resolveLoopStart(
  liveSet: LiveAPI,
  { loopStart }: ArrangementParams,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number | undefined {
  if (loopStart == null) return undefined;

  const loopStartBeats = songPositionToBeats(liveSet, loopStart, {
    toolName: "playback",
    paramName: "loopStart",
    timeSigNumerator,
    timeSigDenominator,
  });

  liveSet.set("loop_start", loopStartBeats);

  return loopStartBeats;
}

/**
 * Resolve loop end time and set loop length
 * @param liveSet - The live_set LiveAPI object
 * @param params - The timeline params
 * @param params.loopEnd - Song position, bar|beat or `loc:<name>`
 * @param loopStartBeats - Resolved loop start in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 */
export function resolveLoopEnd(
  liveSet: LiveAPI,
  { loopEnd }: ArrangementParams,
  loopStartBeats: number | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  if (loopEnd == null) return;

  const loopEndBeats = songPositionToBeats(liveSet, loopEnd, {
    toolName: "playback",
    paramName: "loopEnd",
    timeSigNumerator,
    timeSigDenominator,
  });
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
 * @param startTimeBeats - Resolved start position, or undefined for none
 * @param _state - Current playback state (unused)
 * @returns Updated playback state
 */
export function handlePlayArrangement(
  liveSet: LiveAPI,
  startTimeBeats: number | undefined,
  _state: PlaybackState,
): PlaybackState {
  let resolvedStartTimeBeats = startTimeBeats;

  if (startTimeBeats == null) {
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
