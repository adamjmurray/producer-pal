// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { applyArrangementLoop } from "./arrangement-loop.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  locatorRef,
  songPositionToBeats,
} from "#src/tools/shared/locator/song-position.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { type PlaybackState } from "./scene-playback.ts";

/** What a timeline write actually landed. */
export interface TimelineWrites {
  /** The start position in beats, or undefined when the call named none. */
  startTimeBeats?: number;
  /** Whether the loop was written — a refused loop plan writes nothing. */
  wroteLoop: boolean;
}

/** The loop fields a playback result can carry, by the names the schema publishes. */
interface LoopReport {
  loop?: boolean;
  loopStart?: string;
  loopEnd?: string;
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
 * They are written to the Live Set before the action runs, so without this
 * "play scene 3 from bar 5" fires the scene and silently moves the arrangement
 * start position — a change to the Set the caller never asked for.
 * @param action - The playback action, which decides whether they apply
 * @param params - The timeline params as the caller sent them
 * @returns The params, or none of them when the action works the session
 */
export function resolveArrangementParams<
  T extends ArrangementParams & LegacyLocatorParams,
>(action: string, params: T): Partial<T> {
  if (ARRANGEMENT_ACTIONS.has(action)) {
    return params;
  }

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
 * The loop fields a playback result carries.
 *
 * A written `live_set loop` still reads back as its old value until about 25 ms
 * after the request returns, and V8 can't wait for it. So a call that wrote the
 * loop reports only what the caller didn't say: the end that slid because they
 * named the other, and the bounds a play-arrangement will loop over. A call
 * that wrote none of it reads the loop off the Live Set, which is stale only if
 * a parallel tool call wrote it inside the window.
 * @param liveSet - The live_set LiveAPI object
 * @param action - The playback action that just ran
 * @param timeline - The timeline params, with locators already folded in
 * @param wroteLoop - Whether the loop was written; a refused plan writes nothing
 * @returns The loop fields for the result, empty when it has nothing to say
 */
export function reportArrangementLoop(
  liveSet: LiveAPI,
  action: string,
  timeline: ArrangementParams,
  wroteLoop: boolean,
): LoopReport {
  const { loop, loopStart, loopEnd } = timeline;
  const obeysLoop = action === PLAY_ARRANGEMENT;

  // A refused loop lands nothing, so its params say nothing about the Set — the
  // call is one that left the loop alone, whatever it asked for.
  if (!wroteLoop) {
    if (!obeysLoop) {
      return {};
    }

    const loopEnabled = (liveSet.getProperty("loop") as number) > 0;

    // Bounds a loop that's off won't use aren't worth the tokens.
    return loopEnabled
      ? { loop: true, ...loopBounds(liveSet) }
      : { loop: false };
  }

  // Naming one end slides the loop, so the end the caller didn't name moved.
  // Otherwise the bounds are news only where the playback obeys them.
  const namedStart = loopStart != null;
  const namedEnd = loopEnd != null;
  const worthReporting =
    namedStart !== namedEnd || (obeysLoop && loop !== false);
  const reportsStart = !namedStart && worthReporting;
  const reportsEnd = !namedEnd && worthReporting;

  if (!reportsStart && !reportsEnd) {
    return {};
  }

  const bounds = loopBounds(liveSet);

  return {
    ...(reportsStart && { loopStart: bounds.loopStart }),
    ...(reportsEnd && { loopEnd: bounds.loopEnd }),
  };
}

/**
 * The loop's bounds in bar|beat. `loop_start` and `loop_length` do read back
 * inside the request that wrote them, unlike `loop` itself.
 * @param liveSet - The live_set LiveAPI object
 * @returns The loop's two ends
 */
function loopBounds(liveSet: LiveAPI): {
  loopStart: string;
  loopEnd: string;
} {
  const { numerator: timeSigNumerator, denominator: timeSigDenominator } =
    songMeter();
  const startBeats = liveSet.getProperty("loop_start") as number;
  const lengthBeats = liveSet.getProperty("loop_length") as number;

  return {
    loopStart: abletonBeatsToBarBeat(
      startBeats,
      timeSigNumerator,
      timeSigDenominator,
    ),
    loopEnd: abletonBeatsToBarBeat(
      startBeats + lengthBeats,
      timeSigNumerator,
      timeSigDenominator,
    ),
  };
}

/**
 * Write the arrangement timeline: the start position and the loop.
 * @param liveSet - The live_set LiveAPI object
 * @param timeline - The timeline params, with locators already folded in
 * @returns What the write landed, which a refused loop plan changes
 */
export function applyArrangementTimeline(
  liveSet: LiveAPI,
  timeline: ArrangementParams,
): TimelineWrites {
  const startTimeBeats = resolveStartTime(liveSet, timeline);
  const wroteLoop = applyArrangementLoop(liveSet, timeline);

  return { startTimeBeats, wroteLoop };
}

/**
 * Read the arrangement start position back after the action, and report it only
 * when it is news: one the caller didn't write, one Live didn't put where they
 * asked, or one a `loc:` name resolved to. play-arrangement always reads it,
 * because that is where playback just began.
 * @param liveSet - The live_set LiveAPI object
 * @param action - The playback action that just ran
 * @param wrote - The start position the call sent, and the beat it resolved to
 * @returns The start position in bar|beat, or undefined when it says nothing
 */
export function readStartTime(
  liveSet: LiveAPI,
  action: string,
  wrote: TimelineWrites & { startTime?: string },
): string | undefined {
  const { startTime, startTimeBeats } = wrote;

  if (startTimeBeats == null && action !== PLAY_ARRANGEMENT) {
    return undefined;
  }

  const { numerator: timeSigNumerator, denominator: timeSigDenominator } =
    songMeter();
  const beats = liveSet.getProperty("start_time") as number;
  // A locator resolved to a bar the caller has never seen, so it always
  // reports. A bar|beat they wrote themselves reports only when Live moved it:
  // the margin is for the 32-bit float Live stores, far below one tick.
  const landedWhereAsked =
    startTimeBeats != null &&
    locatorRef(startTime ?? "") == null &&
    Math.abs(beats - startTimeBeats) < 1e-6;

  return landedWhereAsked
    ? undefined
    : abletonBeatsToBarBeat(beats, timeSigNumerator, timeSigDenominator);
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

    if (locator == null) {
      continue;
    }

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
 * @returns The start position in beats, or undefined when none was given
 */
export function resolveStartTime(
  liveSet: LiveAPI,
  { startTime }: ArrangementParams,
): number | undefined {
  if (startTime == null) {
    return undefined;
  }

  const { numerator: timeSigNumerator, denominator: timeSigDenominator } =
    songMeter();
  const startTimeBeats = songPositionToBeats(liveSet, startTime, {
    paramName: "startTime",
    timeSigNumerator,
    timeSigDenominator,
  });

  liveSet.set("start_time", startTimeBeats);

  return startTimeBeats;
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
