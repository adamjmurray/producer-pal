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
import { findFunctionName } from "./flat-waveforms.ts";
import { type TimeRange } from "./transform-context.ts";
import { operatorDisplay } from "./transform-evaluation.ts";

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

/** Slack for float drift when comparing the unused tail against the grid. */
const TAIL_EPSILON = 1e-6;

/**
 * Warn when a `ramp()`/`curve()` assignment never reached its end value.
 *
 * These interpolate across the SELECTOR'S TIME RANGE, not across the notes they
 * matched, so a range ending after the last matched note stops short — silently.
 * On 16th-note hats that stop at 2|4.5, `2|3-3|1: velocity = ramp(1, 127)`
 * gets only three quarters of the way to 127. The fix is to end the range ON
 * the last note (`2|4.5`), and nothing else in the response says so.
 *
 * The tolerance is one grid step: stay quiet when the unused tail of the range
 * is no longer than the smallest gap between the selected notes, since ending
 * on a round bound one step past the last note is the normal way to write it.
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
  if (!hasTimeRange || positions.length < 2) {
    return;
  }

  const name = findFunctionName(expression, RAMP_NAMES);

  if (name == null) {
    return;
  }

  const span = range.end - range.start;

  if (span <= 0) {
    return;
  }

  const last = Math.max(...positions);
  const step = smallestGap(positions);

  // One distinct position is one phase, whatever the range: nothing to report.
  if (step == null || range.end - last <= step + TAIL_EPSILON) {
    return;
  }

  const reached = (last - range.start) / span;

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

/**
 * Smallest gap between distinct note start positions.
 * @param positions - Note start positions, in musical beats
 * @returns The smallest gap, or null when the notes share one position
 */
function smallestGap(positions: number[]): number | null {
  const sorted = positions.toSorted((a, b) => a - b);
  let smallest: number | null = null;

  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i] as number) - (sorted[i - 1] as number);

    if (gap > TAIL_EPSILON && (smallest == null || gap < smallest)) {
      smallest = gap;
    }
  }

  return smallest;
}
