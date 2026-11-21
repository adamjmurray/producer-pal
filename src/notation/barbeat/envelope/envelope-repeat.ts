// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A repeated envelope point, `1|1x16@n/16 0.5`: the notes grammar's repeat
// pattern, with the step always written since an envelope has no duration to
// default to.

import { durationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";

/** The count and step after the `x`. */
const COUNT_AND_STEP = /^(\d+)@(\S+)$/;

/** The most points the remote script takes in one envelope write. */
const MAX_REPEAT_COUNT = 1000;

/** A point's time as written: where it starts, and how it repeats. */
export interface EnvelopeRepeat {
  /** The bar|beat the first point sits at */
  barBeat: string;
  /** How many points; 1 when the time has no repeat */
  count: number;
  /** The note-value gap between points, when it repeats */
  step?: string;
}

/**
 * Read a point's time, splitting off its `x<count>@<step>` repeat.
 * @param time - The time as written, like "1|1" or "1|1x16@n/16"
 * @returns The bar|beat, the count and the step
 * @throws If the repeat has no count, no step, or a malformed one
 */
export function readEnvelopeRepeat(time: string): EnvelopeRepeat {
  const x = time.indexOf("x");

  if (x < 0) {
    return { barBeat: time, count: 1 };
  }

  const match = COUNT_AND_STEP.exec(time.slice(x + 1));
  const count = Number(match?.[1]);

  if (match == null || count < 1 || count > MAX_REPEAT_COUNT) {
    throw new Error(
      `Invalid envelope repeat: "${time}". Expected "bar|beat x count @ step" with a count from 1 to ${String(MAX_REPEAT_COUNT)} and a note-value step, like "1|1x16@n/16"`,
    );
  }

  const step = match[2] as string;

  // Its length waits for the clip's meter, but zero is zero in every meter.
  if (durationToAbletonBeats(step, 4, 4) === 0) {
    throw new Error(
      `Invalid envelope repeat step "@${step}": it must move forwards, like "@n/16"`,
    );
  }

  return { barBeat: time.slice(0, x), count, step };
}

/**
 * The times a repeated point lands on.
 * @param start - The first point's time, in Ableton beats
 * @param repeat - The point's repeat
 * @param timeSigNumerator - The clip meter's numerator
 * @param timeSigDenominator - The clip meter's denominator
 * @returns One time per point
 * @throws If the step is zero or less in this meter
 */
export function envelopeRepeatTimes(
  start: number,
  repeat: EnvelopeRepeat,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number[] {
  if (repeat.step == null) {
    return [start];
  }

  const step = durationToAbletonBeats(
    repeat.step,
    timeSigNumerator,
    timeSigDenominator,
  );

  if (step <= 0) {
    throw new Error(
      `Invalid envelope repeat step "@${repeat.step}": it must move forwards, like "@n/16"`,
    );
  }

  return Array.from(
    { length: repeat.count },
    (_, index) => start + index * step,
  );
}

/** A repeat's `x<count>@`, wherever it sits. */
const REPEAT_MARK = /x\s*\d+\s*@/;

/** A point that opens with a well-placed repeat. */
const OPENS_WITH_REPEAT = /^\S*x\d+@\S+(?:\s|$)/;

/**
 * Say where a repeat goes when a malformed point set one apart from its time,
 * or wrote it after the value.
 * @param token - The point as written
 * @param value - The point's value text, when only that is malformed
 * @throws If the point, or the value alone, holds a misplaced repeat
 */
export function throwIfRepeatMisplaced(token: string, value?: string): void {
  const misplaced =
    value == null
      ? REPEAT_MARK.test(token) && !OPENS_WITH_REPEAT.test(token)
      : REPEAT_MARK.test(value);

  if (misplaced) {
    throw new Error(
      `Invalid envelope point: "${token}". A repeat goes right after the time, with no space, like "1|1x32@n/16 rand(0, 1)"`,
    );
  }
}
