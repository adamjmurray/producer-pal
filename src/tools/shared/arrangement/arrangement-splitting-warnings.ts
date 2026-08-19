// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a split call says about the parts of the request that did nothing.
// Splitting several clips at one song position is the point, so a position
// missing SOME clips is expected and silent. What has to be said out loud is a
// call that cut nothing at all, or a position that cut nothing anywhere.

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type SplitMode } from "#src/tools/shared/arrangement/arrangement-splitting.ts";

/** A clip no split point fell inside, held until the whole call is known. */
export interface SplitMiss {
  clipId: string;
  clipArrangementStart: number;
  clipLength: number;
}

/**
 * Warn that nothing was cut, naming the span the caller should have aimed at in
 * whichever coordinates it used.
 *
 * Only for the call that cut nothing anywhere. When something was cut,
 * {@link warnUnusedSplitPoints} reports the narrower failure.
 * @param misses - The clips no split point fell inside
 * @param mode - How the caller's positions are read
 */
export function warnNothingSplit(misses: SplitMiss[], mode: SplitMode): void {
  const toBarBeat = barBeatFormatter();
  const spans = misses
    .map(({ clipId, clipArrangementStart, clipLength }) =>
      mode.origin === "song"
        ? `${clipId} (${toBarBeat(clipArrangementStart)} to ${toBarBeat(clipArrangementStart + clipLength)})`
        : `${clipId} (1|1 to ${toBarBeat(clipLength)})`,
    )
    .join(", ");

  const where =
    mode.origin === "song"
      ? "Positions are on the song timeline; the clips span"
      : "Positions are relative to each clip's start (1|1), and must be before its end; the clips span";

  console.warn(
    `${mode.param} cut nothing: no split point falls inside any of the clips. ${where} ${spans}.`,
  );
}

/**
 * Warn about the positions that cut nothing anywhere, once something was cut.
 * A cut clip makes the result look like the call worked, and the clips a
 * position missed come back unchanged with nothing to say they were meant to
 * be cut — absence a model reads as success.
 * @param splitPoints - Every position the caller asked for, in order
 * @param usedPoints - Indices of the positions that fell inside some clip
 * @param mode - How the caller's positions are read
 */
export function warnUnusedSplitPoints(
  splitPoints: number[],
  usedPoints: Set<number>,
  mode: SplitMode,
): void {
  const unused = splitPoints.filter((_, index) => !usedPoints.has(index));

  if (unused.length === 0) return;

  const toBarBeat = barBeatFormatter();
  const positions = unused.map((point) => toBarBeat(point)).join(", ");
  const why =
    mode.origin === "song"
      ? "no clip in the call spans"
      : "positions are relative to each clip's start, and no clip is long enough for";

  console.warn(
    `${mode.param} cut nothing at ${positions}: ${why} ${unused.length === 1 ? "it" : "them"}.`,
  );
}

/**
 * A bar|beat formatter in the song's meter, for warning text.
 * @returns Beats to "bar|beat"
 */
function barBeatFormatter(): (beats: number) => string {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const numerator = liveSet.getProperty("signature_numerator") as number;
  const denominator = liveSet.getProperty("signature_denominator") as number;

  return (beats) => abletonBeatsToBarBeat(beats, numerator, denominator);
}
