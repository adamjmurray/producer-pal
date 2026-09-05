// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { songPositionToBeats } from "#src/tools/shared/locator/song-position.ts";
import { type ArrangementParams } from "./playback-helpers.ts";

/** Where the loop should end up: Live stores a start and a length, not two ends. */
interface LoopPlan {
  startBeats: number;
  lengthBeats: number;
}

/** A plan, or the reason there isn't one. */
type PlannedLoop = { plan: LoopPlan } | { refusal: string };

/**
 * Write the arrangement loop, or leave every part of it alone.
 *
 * The three writes — on/off, start, length — go together. A plan that can't be
 * had is refused whole, because writing the start and then refusing the length
 * leaves a loop the caller never asked for.
 * @param liveSet - The live_set LiveAPI object
 * @param timeline - The timeline params, with locators already folded in
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 */
export function applyArrangementLoop(
  liveSet: LiveAPI,
  timeline: ArrangementParams,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  const { loop, loopStart, loopEnd } = timeline;

  if (loop == null && loopStart == null && loopEnd == null) return;

  const namesABound = loopStart != null || loopEnd != null;
  const toBeats = (value: string, paramName: string): number =>
    songPositionToBeats(liveSet, value, {
      paramName,
      timeSigNumerator,
      timeSigDenominator,
    });
  const planned = namesABound
    ? planLoop({
        startBeats: loopStart == null ? null : toBeats(loopStart, "loopStart"),
        endBeats: loopEnd == null ? null : toBeats(loopEnd, "loopEnd"),
        currentLengthBeats: liveSet.getProperty("loop_length") as number,
        timeSigNumerator,
        timeSigDenominator,
      })
    : null;

  if (planned != null && "refusal" in planned) {
    console.warn(planned.refusal);

    return;
  }

  // Bounds with the loop off do nothing audible, so naming either turns it on.
  // An explicit loop still wins, so `loop: false` can set bounds for later.
  const enableLoop = loop ?? (namesABound ? true : undefined);

  if (enableLoop != null) {
    liveSet.set("loop", enableLoop);
  }

  if (planned != null) {
    liveSet.set("loop_start", planned.plan.startBeats);
    liveSet.set("loop_length", planned.plan.lengthBeats);
  }
}

/**
 * Work out where the loop lands. One end alone slides the whole loop and keeps
 * its length, the way dragging the loop brace in Live does; both ends set the
 * span outright. At least one end is always named — a call that names neither
 * has no bounds to plan.
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
    return {
      refusal:
        `loopEnd ${barBeat(endBeats as number)} would start the loop before ` +
        `1|1 — leaving the loop as it was`,
    };
  }

  return { plan: { startBeats: slid, lengthBeats: currentLengthBeats } };
}
