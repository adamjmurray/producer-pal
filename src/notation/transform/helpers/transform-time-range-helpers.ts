// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { barBeatToMusicalBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { type TimeRange as ParserTimeRange } from "../parser/transform-parser.ts";

/**
 * Convert a parser TimeRange (bar|beat bounds) to absolute musical-beats bounds.
 * Shared by calculateActiveTimeRange and the note-op selector so membership and
 * normalization stay in lockstep. A bound's beat field is not clamped to its bar
 * — a `+n` offset can push it past the bar and a `-n` offset can borrow below
 * beat 1 — so the conversion goes through barBeatToMusicalBeats, the same
 * normalization handed to ramp/curve. Musical beats per bar = the numerator.
 * @param timeRange - Parser time range with bar|beat bounds
 * @param numerator - Time signature numerator (musical beats per bar)
 * @returns Absolute start/end in musical beats plus the endExclusive flag
 */
export function timeRangeBoundsInMusicalBeats(
  timeRange: ParserTimeRange,
  numerator: number,
): { start: number; end: number; endExclusive: boolean } {
  return {
    start: barBeatToMusicalBeats(
      `${timeRange.startBar}|${timeRange.startBeat}`,
      numerator,
    ),
    end: barBeatToMusicalBeats(
      `${timeRange.endBar}|${timeRange.endBeat}`,
      numerator,
    ),
    endExclusive: timeRange.endExclusive === true,
  };
}

/**
 * Test whether a note's absolute musical-beats position falls within a parser
 * time range. End bound is inclusive by default; half-open (`N|*` whole-bar
 * selectors and the `-<` marker) drops a note that lands exactly on the end
 * downbeat. Comparing in the same absolute beats as the bounds keeps the
 * membership gate and the ramp/curve normalization in lockstep.
 * @param noteBeats - Note position in absolute musical beats
 * @param timeRange - Parser time range with bar|beat bounds
 * @param numerator - Time signature numerator (musical beats per bar)
 * @returns True if the note is inside the range
 */
export function noteInTimeRange(
  noteBeats: number,
  timeRange: ParserTimeRange,
  numerator: number,
): boolean {
  const { start, end, endExclusive } = timeRangeBoundsInMusicalBeats(
    timeRange,
    numerator,
  );
  const pastEnd = endExclusive ? noteBeats >= end : noteBeats > end;

  return noteBeats >= start && !pastEnd;
}
