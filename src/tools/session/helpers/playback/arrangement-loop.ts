// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { songPositionToBeats } from "#src/tools/shared/locator/song-position.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { type ArrangementParams } from "./arrangement-playback.ts";

/** Where the loop should end up: Live stores a start and a length, not two ends. */
interface LoopPlan {
  startBeats: number;
  lengthBeats: number;
}

/** A plan, or the reason there isn't one. */
type PlannedLoop = { plan: LoopPlan } | { refusal: string };

/** The loop write a call asks for, resolved and checked, not yet written. */
export interface LoopWrite {
  /** Whether the loop ends up on */
  loop: boolean;
  /** Where the bounds go, or null when the call names none */
  plan: LoopPlan | null;
  /** Why the plan can't be had: the loop is then left alone whole */
  refusal?: string;
}

/**
 * Resolve the loop params, writing nothing: a bound that can't be read throws
 * here, before the call has changed anything.
 *
 * The three writes — on/off, start, length — go together: a plan that can't be
 * had is refused whole, or the caller gets a loop they never asked for.
 * @param liveSet - The live_set LiveAPI object
 * @param timeline - The timeline params, with locators already folded in
 * @returns The write to make, or null when the call names no loop param
 */
export function planArrangementLoop(
  liveSet: LiveAPI,
  timeline: ArrangementParams,
): LoopWrite | null {
  const { loop, loopStart, loopEnd } = timeline;

  if (loop == null && loopStart == null && loopEnd == null) {
    return null;
  }

  // Bounds with the loop off do nothing audible, so naming either turns it on.
  // An explicit loop still wins, so `loop: false` can set bounds for later.
  // Naming none of the three returned above, so there is always a value here.
  const enabled = loop ?? true;

  if (loopStart == null && loopEnd == null) {
    return { loop: enabled, plan: null };
  }

  const { numerator: timeSigNumerator, denominator: timeSigDenominator } =
    songMeter();
  const toBeats = (value: string, paramName: string): number =>
    songPositionToBeats(liveSet, value, {
      paramName,
      timeSigNumerator,
      timeSigDenominator,
    });
  const planned = planLoop({
    startBeats: loopStart == null ? null : toBeats(loopStart, "loopStart"),
    endBeats: loopEnd == null ? null : toBeats(loopEnd, "loopEnd"),
    currentLengthBeats: liveSet.getProperty("loop_length") as number,
    timeSigNumerator,
    timeSigDenominator,
  });

  return "refusal" in planned
    ? { loop: enabled, plan: null, refusal: planned.refusal }
    : { loop: enabled, plan: planned.plan };
}

/**
 * Write the loop planned, or leave every part of it alone.
 * @param liveSet - The live_set LiveAPI object
 * @param write - What {@link planArrangementLoop} planned
 * @param landed - Records what has changed Live, for an error later in the call
 * @returns Whether the loop was written — a refused plan writes nothing
 */
export function writeArrangementLoop(
  liveSet: LiveAPI,
  write: LoopWrite,
  landed: (phrase: string) => void,
): boolean {
  if (write.refusal != null) {
    console.warn(write.refusal);

    return false;
  }

  liveSet.set("loop", write.loop);
  landed("loop");

  if (write.plan != null) {
    liveSet.set("loop_start", write.plan.startBeats);
    liveSet.set("loop_length", write.plan.lengthBeats);
  }

  return true;
}

/**
 * Work out where the loop lands. One end alone slides the whole loop and keeps
 * its length, the way dragging the loop brace in Live does; both ends set the
 * span outright. At least one end is always named.
 * @param params - The resolved ends and the loop's current length
 * @param params.startBeats - Requested loop start, or null when only the end is named
 * @param params.endBeats - Requested loop end, or null when only the start is named
 * @param params.currentLengthBeats - The loop's length before this call
 * @param params.timeSigNumerator - Time signature numerator
 * @param params.timeSigDenominator - Time signature denominator
 * @returns The plan, or the reason the loop can't go there
 */
function planLoop({
  startBeats,
  endBeats,
  currentLengthBeats,
  timeSigNumerator,
  timeSigDenominator,
}: {
  startBeats: number | null;
  endBeats: number | null;
  currentLengthBeats: number;
  timeSigNumerator: number;
  timeSigDenominator: number;
}): PlannedLoop {
  const barBeat = (beats: number): string =>
    abletonBeatsToBarBeat(beats, timeSigNumerator, timeSigDenominator);

  if (startBeats != null && endBeats != null) {
    const lengthBeats = endBeats - startBeats;

    if (lengthBeats <= 0) {
      return {
        refusal:
          `loopEnd ${barBeat(endBeats)} is not after loopStart ` +
          `${barBeat(startBeats)} — leaving the loop as it was`,
      };
    }

    return { plan: { startBeats, lengthBeats } };
  }

  // One end slides the loop, so the other end moves with it — and the start
  // can't slide off the front of the song.
  const slid = startBeats ?? (endBeats as number) - currentLengthBeats;

  if (slid < 0) {
    const refusal =
      startBeats != null
        ? `loopStart ${barBeat(startBeats)} is before 1|1 — leaving the loop as it was`
        : `loopEnd ${barBeat(endBeats as number)} would set the loop start before ` +
          `1|1 — leaving the loop as it was`;

    return { refusal };
  }

  return { plan: { startBeats: slid, lengthBeats: currentLengthBeats } };
}
