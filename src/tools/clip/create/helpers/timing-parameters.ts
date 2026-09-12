// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  durationToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

export interface TimingParameters {
  arrangementStartBeats: number | null;
  startBeats: number | null;
  firstStartBeats: number | null;
  endBeats: number | null;
}

/**
 * Converts bar|beat timing parameters to Ableton beats
 * @param arrangementStart - Arrangement start position in bar|beat format
 * @param start - Loop start position in bar|beat format
 * @param firstStart - First playback start position in bar|beat format
 * @param length - Clip length in bar|beat duration format
 * @param looping - Whether the clip is looping
 * @param timeSigNumerator - Clip time signature numerator
 * @param timeSigDenominator - Clip time signature denominator
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @returns Converted timing parameters in beats
 */
export function convertTimingParameters(
  arrangementStart: string | null,
  start: string | null,
  firstStart: string | null,
  length: string | null,
  looping: boolean | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
): TimingParameters {
  // Convert bar|beat timing parameters to Ableton beats. Validate the standalone
  // position fields first so a 0-indexed/zero-bar position is a hard error
  // (matching the notes grammar), not a silent pre-origin beat.
  let arrangementStartBeats: number | null = null;

  if (arrangementStart != null) {
    validateBarBeatPosition(arrangementStart);
    arrangementStartBeats = barBeatToAbletonBeats(
      arrangementStart,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  }

  let startBeats: number | null = null;

  if (start != null) {
    validateBarBeatPosition(start);
    startBeats = barBeatToAbletonBeats(
      start,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  let firstStartBeats: number | null = null;

  if (firstStart != null) {
    validateBarBeatPosition(firstStart);
    firstStartBeats = barBeatToAbletonBeats(
      firstStart,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && looping === false) {
    console.warn("firstStart parameter ignored for non-looping clips");
  }

  // Convert length parameter to end position
  let endBeats: number | null = null;

  if (length != null) {
    const lengthBeats = durationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );
    const startOffsetBeats = startBeats ?? 0;

    endBeats = startOffsetBeats + lengthBeats;
  }

  return { arrangementStartBeats, startBeats, firstStartBeats, endBeats };
}
