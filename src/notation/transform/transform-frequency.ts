// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { barBeatDurationToMusicalBeats } from "#src/notation/barbeat/time/barbeat-time.ts";

export interface PeriodObject {
  type: "period";
  bars: number;
  beats: number;
}

/**
 * Parse a period parameter and convert to period in musical beats
 * @param periodObj - Period object from parser
 * @param timeSigNumerator - Time signature numerator
 * @returns Period in musical beats
 */
export function parseFrequency(
  periodObj: PeriodObject,
  timeSigNumerator: number,
): number {
  // Runtime type check for JavaScript callers (TypeScript can't enforce at runtime)
  if ((periodObj as { type: string }).type !== "period") {
    throw new Error(
      `Invalid period object: expected type "period", got "${(periodObj as { type: string }).type}"`,
    );
  }

  // Convert bar:beat duration to musical beats
  const barBeatString = `${periodObj.bars}:${periodObj.beats}`;
  const periodInBeats = barBeatDurationToMusicalBeats(
    barBeatString,
    timeSigNumerator,
  );

  if (periodInBeats <= 0) {
    throw new Error(
      `Period must be positive, got: ${periodInBeats} beats (from ${barBeatString}t)`,
    );
  }

  return periodInBeats;
}
