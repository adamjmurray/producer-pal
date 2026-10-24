// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  abletonBeatsToBarBeat,
  abletonBeatsToDuration,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  MAX_ARRANGEMENT_LENGTH_BEATS,
  MAX_ARRANGEMENT_POSITION_BEATS,
} from "#src/tools/constants.ts";

/**
 * Refuses an arrangement position Live won't take, saying the last one it will
 * in bar|beat. Call it before anything is made: Live declines such a position
 * without saying why, after earlier work has landed.
 *
 * Not checked here: scene copies laid end to end (Live refuses each one), a
 * clip end pushed past the cap by `arrangementLength`, and locator or loop
 * positions, where Live's limit is unknown.
 * @param beats - The position, in Ableton beats
 * @param timeSigNumerator - Song time signature numerator
 * @param timeSigDenominator - Song time signature denominator
 * @param param - The param the caller wrote the position in
 * @throws When the position is past the last one Live allows
 */
export function refuseArrangementPositionPastCap(
  beats: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  param = "arrangementStart",
): void {
  if (beats <= MAX_ARRANGEMENT_POSITION_BEATS) {
    return;
  }

  const last = abletonBeatsToBarBeat(
    MAX_ARRANGEMENT_POSITION_BEATS,
    timeSigNumerator,
    timeSigDenominator,
  );

  throw new Error(`${param} is past the last position Live allows (${last})`);
}

/**
 * Refuses an `arrangementLength` longer than Producer Pal takes, saying the
 * longest in the song's meter. The limit is ours, not Live's, and only stops
 * absurd lengths: one under it can still run to the deadline.
 * @param lengthBeats - The length, in Ableton beats
 * @param timeSigNumerator - Song time signature numerator
 * @param timeSigDenominator - Song time signature denominator
 * @throws When the length is over the limit
 */
export function refuseArrangementLengthTooLong(
  lengthBeats: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  if (lengthBeats <= MAX_ARRANGEMENT_LENGTH_BEATS) {
    return;
  }

  const max = abletonBeatsToDuration(
    MAX_ARRANGEMENT_LENGTH_BEATS,
    timeSigNumerator,
    timeSigDenominator,
  );

  throw new Error(`arrangementLength can be at most ${max}`);
}
