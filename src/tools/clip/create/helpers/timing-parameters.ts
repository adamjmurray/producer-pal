// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  durationToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";

export interface TimingParameters {
  arrangementStartBeats: number | null;
  startBeats: number | null;
  firstStartBeats: number | null;
  endBeats: number | null;
  /** Whether firstStart was sent for a clip that won't loop, so it did nothing */
  firstStartIgnored: boolean;
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
 * @returns Converted timing parameters in beats, plus whether firstStart did nothing
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

  // Only a looping clip gets a playback start, and `looping` unset means it
  // won't loop — matches the write guard in buildClipProperties. The caller is
  // told on the clip's own entry.
  const firstStartIgnored = firstStart != null && !looping;

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

  return {
    arrangementStartBeats,
    startBeats,
    firstStartBeats,
    endBeats,
    firstStartIgnored,
  };
}
