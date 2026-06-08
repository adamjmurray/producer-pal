// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { barBeatToMusicalBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { type TimeRange as ParserTimeRange } from "../parser/transform-parser.ts";

// Float tolerance for selector membership. Note positions produced by note-ops
// (ratchet/split via `start + k*duration`) and the selector bounds parsed via
// barBeatToMusicalBeats reach the same musical beat through different float
// arithmetic, so equal positions can differ by a few ULPs (~1e-15). Without
// tolerance an exact-point selector drops the note, and a note on the shared
// boundary of two adjacent half-open buckets lands in the wrong one. 1e-9
// swamps the ULP error yet sits far below any musical distance — the same
// magnitude note-ops uses for grid cuts (GRID_EPSILON).
const SELECTOR_EPSILON = 1e-9;

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
 *
 * Comparisons carry SELECTOR_EPSILON so ULP-level float drift between generated
 * note positions and parsed bounds can't drop or misroute a note. The lower
 * bound is inclusive at `start - ε`; an inclusive end admits up to `end + ε`; a
 * half-open end excludes from `end - ε` onward. The half-open end and the next
 * range's lower bound therefore share the threshold `end - ε`, so a note on the
 * boundary between two adjacent half-open buckets belongs to exactly one — the
 * upper bucket.
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
  const pastEnd = endExclusive
    ? noteBeats >= end - SELECTOR_EPSILON
    : noteBeats > end + SELECTOR_EPSILON;

  return noteBeats >= start - SELECTOR_EPSILON && !pastEnd;
}
