// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.ts";

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
