// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Warnings about a whole assignment rather than a single note: a value that
 * can't mean what it says, and a ramp that never reached its end value.
 */

import { musicalBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  type ExpressionNode,
  type TransformAssignment,
} from "../parser/transform-parser.ts";
import * as console from "../transform-warning-label.ts";
import {
  operatorDisplay,
  type TimeRange,
} from "./transform-evaluator-helpers.ts";
import { findFunctionName } from "./transform-flat-waveform-helpers.ts";

/**
 * Reject a bare pitch literal used as a value for anything but `pitch`.
 *
 * `b2` and `C3` are meaningful as a value only for the `pitch` parameter (and
 * as selectors or function arguments). Assigned anywhere else it is almost
 * certainly a typo that would silently coerce to a MIDI number
 * (`velocity = b2` → 59), so warn and skip rather than corrupt the note.
 *
 * @param assignment - The assignment about to be applied
 * @returns True when the assignment was rejected and must not run
 */
export function rejectsPitchLiteralValue(
  assignment: TransformAssignment,
): boolean {
  const expr = assignment.expression;

  if (
    assignment.parameter === "pitch" ||
    typeof expr !== "object" ||
    expr.type !== "pitchLiteral"
  ) {
    return false;
  }

  console.warn(
    `note name "${expr.name}" isn't a value for ${assignment.parameter}; pitch names set the pitch parameter, act as selectors (C3:), or are function arguments (e.g. min(C3,C5)). Skipping "${assignment.parameter} ${operatorDisplay(assignment.operator)}".`,
  );

  return true;
}

/** The functions whose value is a position within the time range. */
const RAMP_NAMES = new Set(["ramp", "curve"]);

/**
 * How much of the range may go unused before it counts as a mistake. Ending the
 * range one grid step past the last note is the normal cost of writing a round
 * bound (`1|1-3|1` over 16ths leaves 3%); ending it a whole beat past is the
 * error worth reporting.
 */
const TOLERATED_SHORTFALL = 0.05;

/**
 * Warn when a `ramp()`/`curve()` assignment never reached its end value.
 *
 * These interpolate across the SELECTOR'S TIME RANGE, not across the notes they
 * matched, so a range ending after the last matched note stops short — silently.
 * On 16th-note hats, `2|3-3|1: velocity = ramp(1, 127)` tops out at 111,
 * because the last hit sits at 7/8 of the range. The fix is to end the range ON
 * the last note (`2|4.75`), and nothing else in the response says so.
 *
 * Only for an explicitly scoped range. Unscoped, the range is the clip, and
 * falling one note short of the clip end is both unavoidable and documented —
 * warning on it would fire on every whole-clip ramp.
 *
 * @param expression - The assignment's expression
 * @param hasTimeRange - Whether the assignment carried its own range selector
 * @param positions - Selected notes' start positions, in musical beats
 * @param range - The range the ramp interpolates across, in musical beats
 * @param beatsPerBar - Musical beats per bar, to name the position to end on
 * @param timeSigDenominator - Time signature denominator, for the `±n` offset unit
 */
export function warnShortRamp(
  expression: ExpressionNode,
  hasTimeRange: boolean,
  positions: number[],
  range: TimeRange,
  beatsPerBar: number,
  timeSigDenominator: number,
): void {
  if (!hasTimeRange || positions.length < 2) return;

  const name = findFunctionName(expression, RAMP_NAMES);

  if (name == null) return;

  const span = range.end - range.start;

  if (span <= 0) return;

  const last = Math.max(...positions);
  const reached = (last - range.start) / span;

  if (reached > 1 - TOLERATED_SHORTFALL) return;

  const lastBarBeat = musicalBeatsToBarBeat(
    last,
    beatsPerBar,
    timeSigDenominator,
  );

  console.warn(
    `${name}() only got ${Math.round(reached * 100)}% of the way to its end ` +
      `value — it spans the time range, and the last matched note is before ` +
      `the range end. End the range on that note (${lastBarBeat}) to reach it.`,
  );
}
