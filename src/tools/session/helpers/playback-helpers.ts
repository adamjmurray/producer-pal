// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { applyArrangementLoop } from "./arrangement-loop.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { sceneDisplayName } from "#src/tools/scene/scene-helpers.ts";
import { songPositionToBeats } from "#src/tools/shared/locator/song-position.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

interface LoopState {
  startBeats: number;
  start: string;
  end: string;
}

/** The params that address the arrangement timeline: the start position and the loop. */
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

/** The action that plays the arrangement, named in a few places. */
export const PLAY_ARRANGEMENT = "play-arrangement";

/** The actions that read the arrangement timeline. The rest work the session. */
const ARRANGEMENT_ACTIONS = new Set([
  PLAY_ARRANGEMENT,
  "update-arrangement",
  "stop",
]);

/**
 * Drop the arrangement-timeline params on an action that doesn't use them.
 *
 * These are written to the Live Set before the action runs, so a session action
 * used to apply them anyway: "play scene 3 from bar 5" fired the scene and moved
 * the arrangement start position, without a word. The scene had nothing to do with the
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
        `the start position and loop`,
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
 * Write the arrangement timeline: the start position and the loop.
 * @param liveSet - The live_set LiveAPI object
 * @param timeline - The timeline params, with locators already folded in
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns The start position in beats, or undefined when none was given
 */
export function applyArrangementTimeline(
  liveSet: LiveAPI,
  timeline: ArrangementParams,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number | undefined {
  const startTimeBeats = resolveStartTime(
    liveSet,
    timeline,
    timeSigNumerator,
    timeSigDenominator,
  );

  applyArrangementLoop(liveSet, timeline, timeSigNumerator, timeSigDenominator);

  return startTimeBeats;
}

/**
 * Read the arrangement start position back after the action, so a value Live
 * snapped is what the caller sees. Reported when the call set it, and on
 * play-arrangement, which is governed by it — that's where playback just
 * began, and the caller may never have read it. Nothing else moves it.
 * @param liveSet - The live_set LiveAPI object
 * @param action - The playback action that just ran
 * @param wroteStartTime - Whether the call set the start position itself
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns The start position in bar|beat, or undefined when nothing moved it
 */
export function readStartTime(
  liveSet: LiveAPI,
  action: string,
  wroteStartTime: boolean,
  timeSigNumerator: number,
  timeSigDenominator: number,
): string | undefined {
  if (!wroteStartTime && action !== PLAY_ARRANGEMENT) return undefined;

  return abletonBeatsToBarBeat(
    liveSet.getProperty("start_time") as number,
    timeSigNumerator,
    timeSigDenominator,
  );
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
      throw new Error(`${position} cannot be used with ${legacy}`);
    }

    folded[position] = `loc:${locator}`;
  }

  return folded;
}

/**
 * Resolve the arrangement start position and write it. This is where the next
 * play begins; it does not move the playhead.
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
    paramName: "startTime",
    timeSigNumerator,
    timeSigDenominator,
  });

  liveSet.set("start_time", startTimeBeats);

  return startTimeBeats;
}

/** The scene play-scene fired, for the response */
export interface FiredScene {
  id: string;
  path?: string;
  name: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  /**
   * Set by play-scene only. The scene can be named by a scene id or by a clip
   * in it, so the caller doesn't always know which one fired.
   */
  scene?: FiredScene;
}

/**
 * Handle playing the arrangement view. Playback begins at the arrangement
 * start position, which the caller sets with startTime or leaves as it is.
 * @param liveSet - LiveAPI instance for live_set
 * @returns Updated playback state
 */
export function handlePlayArrangement(liveSet: LiveAPI): PlaybackState {
  liveSet.set("back_to_arranger", 0);
  liveSet.call("start_playing");

  return { isPlaying: true };
}

/**
 * Handle playing a scene in session view
 * @param sceneIndex - Scene index to play
 * @returns Updated playback state
 */
export function handlePlayScene(sceneIndex: number | undefined): PlaybackState {
  if (sceneIndex == null) {
    throw new Error(
      `path "s<scene>" or a scene id is required for action "play-scene"`,
    );
  }

  const scene = LiveAPI.from(livePath.scene(sceneIndex));

  if (!scene.exists()) {
    throw new Error(`scene at index ${sceneIndex} does not exist`);
  }

  scene.call("fire");

  return {
    isPlaying: true,
    scene: {
      id: scene.id,
      ...pathField(scene),
      name: sceneDisplayName(scene, sceneIndex),
    },
  };
}
