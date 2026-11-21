// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// Clip automation envelopes as one compact string:
//
//   1|1 -0.5 _ 3|1 0.5 ~0.5 5|1 0 / 7|1 1
//
// A point is "bar|beat value". A connector, set off by spaces, says how to get
// to the next point:
//
//   `/`   a straight ramp
//   `_`   hold the previous value until the next point's time, then jump to it
//   `~N`  a curved ramp, N from -1 to 1 with no space after the `~`: positive
//         bends above the straight line, negative below it, ~0 is straight
//
// On read a point may carry Live's display in parentheses: `1|1 0.25 (112 Hz)`.
// Round brackets inside a display are written as square ones, so it stays one
// group. A curve that isn't one Live draws reads as the nearest amount.
//
// On write a point may give the display alone, `1|1 (112 Hz)`, for the caller
// to turn into a raw value; its square brackets turn back into round ones.
// With both, the raw value is the one written.
//
// A write may also repeat a point, `1|1x16@n/16 0.5`, and roll its value,
// `rand(0.5, 1)`, afresh for each point (a curve amount too:
// `~rand(-0.5, 0.5)`). The connector before a repeat arrives at every one of
// its points; a repeat that starts the line holds.

import {
  type CurveCoefficients,
  coefficientsToCurve,
} from "#src/notation/barbeat/envelope/envelope-curves.ts";
import {
  type EnvelopeRand,
  ENVELOPE_VALUE,
  readEnvelopeRand,
} from "#src/notation/barbeat/envelope/envelope-rand.ts";
import {
  type EnvelopeRepeat,
  envelopeRepeatTimes,
  readEnvelopeRepeat,
} from "#src/notation/barbeat/envelope/envelope-repeat.ts";
import { formatDecimal } from "#src/notation/barbeat/serializer/helpers/barbeat-serializer-fractions.ts";
import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
  readBarBeat,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { rand } from "#src/notation/transform/transform-waveforms.ts";

/** Two times count as one, within float noise. */
const EPSILON = 1e-9;

/** A connector token: a straight ramp, a step, or a curve (its amount checked later). */
const CONNECTOR = /^(?:\/|_|~.*)$/;

/** A curve token `~N`: a signed decimal, no space after the `~`. */
const CURVE = /^~([-+]?(?:\d+(?:\.\d*)?|\.\d+))$/;

/** "time value", "time value (display)" or "time (display)"; a value may be a rand() call. */
const POINT =
  /^(\S+)\s+(?:(rand(?:om)?\([^()]*\)|[^\s()]+)(?:\s*\([^()]*\))?|\(([^()]*)\))$/;

/** A repeat's `x<count>@`, wherever it sits. */
const REPEAT_MARK = /x\s*\d+\s*@/;

/** A point that opens with a well-placed repeat. */
const OPENS_WITH_REPEAT = /^\S*x\d+@\S+(?:\s|$)/;

/** Rolled values keep this many significant digits: a write has a size limit. */
const RAND_DIGITS = 6;

/** The clip meter the times are spelled in. */
export interface EnvelopeMeter {
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/** One envelope event, as the remote script reports it. */
export interface EnvelopeNotationEvent {
  /** Ableton beats from the clip start */
  time: number;
  /** Raw min..max */
  value: number;
  /** What Live shows for `value` */
  display?: string;
  /** The curve of the segment this event starts; absent means straight */
  coefficients?: CurveCoefficients;
}

/** One point a notation string spells. */
export interface EnvelopeNotationPoint {
  /** Ableton beats from the clip start */
  time: number;
  /** Raw min..max */
  value: number;
  /** Hold the previous value until `time`, then jump to `value` */
  jump: boolean;
  /** The `~N` amount of the ramp that arrives here; absent for a straight one */
  curve?: number;
}

/**
 * A point as it was written: its raw value, or the display that stands for one
 * (`(112 Hz)`), which only the parameter can turn into a raw value.
 */
export type WrittenEnvelopePoint = Omit<EnvelopeNotationPoint, "value"> &
  ({ value: number } | { display: string });

/**
 * Write a clip's envelope events as notation.
 * @param events - The clip's events, time-sorted
 * @param meter - The clip meter the times are spelled in
 * @returns The notation, or "" when there are no events
 */
export function formatEnvelopeNotation(
  events: EnvelopeNotationEvent[],
  meter: EnvelopeMeter,
): string {
  const points = collapseEvents(events);

  return points
    .map(
      (point, index) =>
        (index === 0
          ? ""
          : `${formatConnector(points[index - 1] as FormattedPoint, point)} `) +
        formatPoint(point, meter),
    )
    .join(" ");
}

/**
 * Read envelope notation back into points.
 * @param text - The notation
 * @param meter - The clip meter the times are spelled in
 * @returns The points in the order they were written, a repeat as one per step
 * @throws If a point, a value or the time order is malformed
 */
export function parseEnvelopeNotation(
  text: string,
  meter: EnvelopeMeter,
): WrittenEnvelopePoint[] {
  if (text.trim() === "") {
    return [];
  }

  const points: WrittenEnvelopePoint[] = [];

  for (const segment of splitOnConnectors(text)) {
    const connector = readConnector(segment.connector);

    for (const [index, point] of parsePoints(segment.text, meter).entries()) {
      const previous = points.at(-1);

      checkOrder(points, point, segment.text.trim());

      // Two points at one time are a jump, and a jump has no ramp to curve. A
      // repeat with no connector before it holds between its own points.
      const jump =
        connector.jump ||
        (index > 0 && segment.connector == null) ||
        (previous != null && sameTime(previous, point));

      const curve = jump ? 0 : rollCurve(connector.curve);

      points.push({ ...point, jump, ...(curve !== 0 && { curve }) });
    }
  }

  return points;
}

/**
 * Check envelope notation's syntax without a meter: each point, value, curve
 * and connector. Times and their order depend on the clip's meter, so
 * {@link parseEnvelopeNotation} checks those once the clip is known.
 * @param text - The notation
 * @throws If a point, a value, a curve or a connector is malformed
 */
export function checkEnvelopeNotation(text: string): void {
  if (text.trim() === "") {
    return;
  }

  for (const segment of splitOnConnectors(text)) {
    readConnector(segment.connector);
    readBarBeat(readPoint(segment.text).repeat.barBeat);
  }
}

// --- Helpers below main exports ---

/** A point on the way out, which still carries Live's display. */
interface FormattedPoint extends EnvelopeNotationEvent {
  jump: boolean;
}

/**
 * Turn Live's events into points. Two events at one time are a jump; when the
 * earlier of the two is already the value we last emitted, the jump alone says
 * it, otherwise both are emitted at that time (a ramp, then the jump).
 * @param events - The clip's events, time-sorted
 * @returns The points to write
 */
function collapseEvents(events: EnvelopeNotationEvent[]): FormattedPoint[] {
  const points: FormattedPoint[] = [];

  for (const group of groupByTime(events)) {
    const first = group[0] as EnvelopeNotationEvent;
    const last = group.at(-1) as EnvelopeNotationEvent;
    const previous = points.at(-1);

    if (group.length === 1) {
      points.push({ ...first, jump: false });
      continue;
    }

    // A leading pair is the parameter's value before its first jump, which the
    // jump itself replaces: one point, with the later value.
    if (
      previous != null &&
      formatValue(previous.value) !== formatValue(first.value)
    ) {
      points.push({ ...first, jump: false });
    }

    points.push({ ...last, jump: previous != null });
  }

  return points;
}

/**
 * Group the events that share a time.
 * @param events - The clip's events, time-sorted
 * @returns One group per distinct time
 */
function groupByTime(
  events: EnvelopeNotationEvent[],
): EnvelopeNotationEvent[][] {
  const groups: EnvelopeNotationEvent[][] = [];

  for (const event of events) {
    const group = groups.at(-1);

    if (group != null && sameTime(group[0] as EnvelopeNotationEvent, event)) {
      group.push(event);
    } else {
      groups.push([event]);
    }
  }

  return groups;
}

/**
 * The connector that arrives at a point: a curve only when it draws one.
 * @param previous - The point the segment starts at
 * @param point - The point it arrives at
 * @returns "_", "/" or "~N"
 */
function formatConnector(
  previous: FormattedPoint,
  point: FormattedPoint,
): string {
  if (point.jump) {
    return "_";
  }

  // A curve on a flat segment draws nothing.
  if (
    previous.coefficients == null ||
    formatValue(previous.value) === formatValue(point.value)
  ) {
    return "/";
  }

  const amount = coefficientsToCurve(
    previous.coefficients,
    point.value > previous.value,
  );

  return amount === 0 ? "/" : `~${String(amount)}`;
}

/**
 * Write one point, with Live's display when it says more than the value does.
 * The display is informational, so its parentheses become square brackets.
 * @param point - The point to write
 * @param meter - The clip meter the time is spelled in
 * @returns "bar|beat value" or "bar|beat value (display)"
 */
function formatPoint(point: FormattedPoint, meter: EnvelopeMeter): string {
  const time = abletonBeatsToBarBeat(
    point.time,
    meter.timeSigNumerator,
    meter.timeSigDenominator,
  );
  const value = formatValue(point.value);
  const display =
    point.display != null && point.display !== value
      ? ` (${point.display.replaceAll("(", "[").replaceAll(")", "]")})`
      : "";

  return `${time} ${value}${display}`;
}

/** Past this many decimals a value is float noise, and reads as 0. */
const MAX_VALUE_DECIMALS = 6;

/**
 * Format a raw parameter value: up to 3 decimals, no trailing zeros. A value
 * below 0.1 keeps 3 significant digits instead, so one on a fine raw range
 * doesn't read back as 0 and shift when the read is written again.
 * @param value - The raw value
 * @returns The value as it is written
 */
function formatValue(value: number): string {
  const size = Math.abs(value);
  const formatted =
    size > 0 && size < 0.1
      ? value
          .toFixed(
            Math.min(MAX_VALUE_DECIMALS, 2 - Math.floor(Math.log10(size))),
          )
          .replace(/\.?0+$/, "")
      : formatDecimal(value);

  return formatted === "-0" ? "0" : formatted;
}

/** A segment of the notation: one point, and the connector before it. */
interface Segment {
  text: string;
  /** The connector token that preceded the point; null before the first */
  connector: string | null;
}

/**
 * Cut the notation at each connector, keeping which connector preceded each
 * point. A connector is a space-separated `/`, `_` or `~N` token: a `/` inside
 * a time (`2|1+n/12`) has no spaces around it, and a "(display)" is one token.
 * @param text - The notation
 * @returns One segment per point
 */
function splitOnConnectors(text: string): Segment[] {
  const segments: Segment[] = [];
  let words: string[] = [];
  let connector: string | null = null;

  for (const token of splitOnSpaces(text)) {
    if (CONNECTOR.test(token)) {
      segments.push({ text: words.join(" "), connector });
      words = [];
      connector = token;
    } else {
      words.push(token);
    }
  }

  segments.push({ text: words.join(" "), connector });

  return segments;
}

/**
 * Split on whitespace, keeping a "(display)" in one piece.
 * @param text - The notation
 * @returns The pieces
 */
function splitOnSpaces(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of text) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }

    if (depth === 0 && /\s/.test(char)) {
      if (current !== "") {
        tokens.push(current);
      }

      current = "";
      continue;
    }

    current += char;
  }

  if (current !== "") {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Read the connector before a point.
 * @param token - The connector token, or null before the first point
 * @returns Whether it jumps, and the curve amount when it has one
 * @throws If a `~` has no amount, or the amount is outside -1..1
 */
function readConnector(token: string | null): {
  jump: boolean;
  curve?: number | EnvelopeRand;
} {
  if (token == null || token === "/") {
    return { jump: false };
  }

  if (token === "_") {
    return { jump: true };
  }

  const range = readEnvelopeRand(token.slice(1));

  if (range != null) {
    if (Math.abs(range.min) > 1 || Math.abs(range.max) > 1) {
      throw new Error(
        `Invalid envelope curve "${token}": the amount must be from -1 to 1, like "~rand(-0.5, 0.5)"`,
      );
    }

    return { jump: false, curve: range };
  }

  const amount = CURVE.exec(token)?.[1];

  if (amount == null) {
    throw new Error(
      `Invalid envelope curve "${token}": write the amount right after the "~", from -1 to 1, like "~0.5" in "1|1 0 ~0.5 2|1 1"`,
    );
  }

  const curve = Number(amount);

  if (Math.abs(curve) > 1) {
    throw new Error(
      `Invalid envelope curve "${token}": the amount must be from -1 to 1, like "~0.5" in "1|1 0 ~0.5 2|1 1"`,
    );
  }

  return curve === 0 ? { jump: false } : { jump: false, curve };
}

/**
 * The curve amount for one point: as written, or a fresh roll of its rand().
 * @param curve - The connector's curve, if it has one
 * @returns The amount, 0 for a straight ramp
 */
function rollCurve(curve: number | EnvelopeRand | undefined): number {
  if (curve == null || typeof curve === "number") {
    return curve ?? 0;
  }

  return rand(curve.min, curve.max);
}

/**
 * Read one "time value (display)" segment into its points: one, or one per
 * step of a repeat, each with its own roll of a rand() value.
 * @param segment - The text between two connectors
 * @param meter - The clip meter the time is spelled in
 * @returns The points, with their times in Ableton beats
 * @throws If the segment isn't a point, or its value or repeat is malformed
 */
function parsePoints(
  segment: string,
  meter: EnvelopeMeter,
): WrittenEnvelopePoint[] {
  const { repeat, value } = readPoint(segment);
  const { timeSigNumerator, timeSigDenominator } = meter;
  const start = barBeatToAbletonBeats(
    repeat.barBeat,
    timeSigNumerator,
    timeSigDenominator,
  );

  return envelopeRepeatTimes(
    start,
    repeat,
    timeSigNumerator,
    timeSigDenominator,
  ).map((time) => ({
    time,
    ...("min" in value
      ? { value: Number(rand(value.min, value.max).toPrecision(RAND_DIGITS)) }
      : value),
    jump: false,
  }));
}

/**
 * The error for a repeat set apart from its time, or written after the value.
 * @param token - The point as written
 * @returns The error, showing where a repeat goes
 */
function misplacedRepeat(token: string): Error {
  return new Error(
    `Invalid envelope point: "${token}". A repeat goes right after the time, with no space, like "1|1x32@n/16 rand(0, 1)"`,
  );
}

/** A point as its text spells it, before the clip's meter places it. */
interface ReadPoint {
  repeat: EnvelopeRepeat;
  /** The raw value, the display that stands for one, or the range to roll one from */
  value: { value: number } | { display: string } | EnvelopeRand;
}

/**
 * Read one segment's time text and value, leaving the time unconverted.
 * @param segment - The text between two connectors
 * @returns The time as written, and the value or what stands for it
 * @throws If the segment isn't a point, or its value or repeat is malformed
 */
function readPoint(segment: string): ReadPoint {
  const token = segment.trim();

  if (token === "") {
    throw new Error(
      `Invalid envelope notation: a connector ("/", "_" or "~N") needs a point on each side, like "1|1 0 / 2|1 1"`,
    );
  }

  const match = POINT.exec(token);

  if (match == null) {
    if (REPEAT_MARK.test(token) && !OPENS_WITH_REPEAT.test(token)) {
      throw misplacedRepeat(token);
    }

    throw new Error(
      `Invalid envelope point: "${token}". Expected "bar|beat value", like "1|1 0.5" (or a display value in parentheses: "1|1 (-6 dB)")`,
    );
  }

  const repeat = readEnvelopeRepeat(match[1] as string);
  const display = match[3]?.trim();

  if (display != null) {
    if (display === "") {
      throw new Error(
        `Invalid envelope point: "${token}". The parentheses are empty; put a display value in them, like "1|1 (-6 dB)"`,
      );
    }

    validateBarBeatPosition(repeat.barBeat);

    // A read prints a display's round brackets as square ones; undo that.
    return {
      repeat,
      value: { display: display.replaceAll("[", "(").replaceAll("]", ")") },
    };
  }

  const valueText = match[2] as string;
  const range = readEnvelopeRand(valueText);

  if (range != null) {
    validateBarBeatPosition(repeat.barBeat);

    return { repeat, value: range };
  }

  if (!ENVELOPE_VALUE.test(valueText)) {
    if (REPEAT_MARK.test(valueText)) {
      throw misplacedRepeat(token);
    }

    throw new Error(
      `Invalid envelope value: "${valueText}" in "${token}". Expected a number, like 0.5 or -1, or rand(min, max)`,
    );
  }

  const value = Number(valueText);

  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid envelope value: "${valueText}" in "${token}". Expected a finite number`,
    );
  }

  validateBarBeatPosition(repeat.barBeat);

  return { repeat, value: { value } };
}

/**
 * Check a point's time against the points before it: forwards only, and at
 * most two points at one time (the ramp and the jump).
 * @param points - The points already read
 * @param point - The point just read
 * @param token - The point's text, for the error
 * @throws If the point goes back in time, or is the third at its time
 */
function checkOrder(
  points: { time: number }[],
  point: { time: number },
  token: string,
): void {
  const previous = points.at(-1);

  if (previous == null) {
    return;
  }

  if (point.time < previous.time - EPSILON) {
    throw new Error(
      `Envelope points must run forwards in time, but "${token}" comes before the point before it`,
    );
  }

  const before = points.at(-2);

  if (
    sameTime(previous, point) &&
    before != null &&
    sameTime(before, previous)
  ) {
    throw new Error(
      `Only two envelope points can share a time (a jump), but "${token}" is a third`,
    );
  }
}

/**
 * Whether two points land at the same time.
 * @param a - One point
 * @param b - The other
 * @returns True when the times match within float noise
 */
function sameTime(a: { time: number }, b: { time: number }): boolean {
  return Math.abs(a.time - b.time) < EPSILON;
}
