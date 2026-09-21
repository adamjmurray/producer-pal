// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Clip automation envelopes as one compact string:
//
//   1|1 -0.5 > 3|1 0.5 ~ 5|1 0
//
// A point is "bar|beat value", `~` ramps to the next point and `>` holds the
// previous value until the next point's time and then jumps to it. On read a
// point may carry Live's display in parentheses: `1|1 0.25 (112 Hz)`.

import { formatDecimal } from "#src/notation/barbeat/serializer/helpers/barbeat-serializer-fractions.ts";
import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";

/** Two times count as one, within float noise. */
const EPSILON = 1e-9;

/** A point's value: a plain decimal, or an exponent form we still accept. */
const VALUE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/** "bar|beat value", with an optional "(display)" a read may have written. */
const POINT = /^(\S+)\s+([^\s()]+)(?:\s*\(([^()]*)\))?$/;

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
}

/** One point a notation string spells. */
export interface EnvelopeNotationPoint {
  /** Ableton beats from the clip start */
  time: number;
  value: number;
  /** Hold the previous value until `time`, then jump to `value` */
  jump: boolean;
}

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
  return collapseEvents(events)
    .map(
      (point, index) =>
        (index === 0 ? "" : point.jump ? "> " : "~ ") +
        formatPoint(point, meter),
    )
    .join(" ");
}

/**
 * Read envelope notation back into points.
 * @param text - The notation
 * @param meter - The clip meter the times are spelled in
 * @returns One point per `bar|beat value`, in the order they were written
 * @throws If a point, a value or the time order is malformed
 */
export function parseEnvelopeNotation(
  text: string,
  meter: EnvelopeMeter,
): EnvelopeNotationPoint[] {
  if (text.trim() === "") {
    return [];
  }

  const points: EnvelopeNotationPoint[] = [];

  for (const segment of splitOnConnectors(text)) {
    const point = parsePoint(segment.text, segment.jump, meter);
    const previous = points.at(-1);

    checkOrder(points, point, segment.text.trim());
    points.push({
      ...point,
      jump: point.jump || (previous != null && sameTime(previous, point)),
    });
  }

  return points;
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
 * Write one point, with Live's display when it says more than the value does.
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
      ? ` (${point.display})`
      : "";

  return `${time} ${value}${display}`;
}

/**
 * Format a raw parameter value: up to 3 decimals, no trailing zeros.
 * @param value - The raw value
 * @returns The value as it is written
 */
function formatValue(value: number): string {
  const formatted = formatDecimal(value);

  return formatted === "-0" ? "0" : formatted;
}

/**
 * Cut the notation at each connector, keeping which connector preceded each
 * point. Connectors inside a "(display)" are the display's, not ours.
 * @param text - The notation
 * @returns One segment per point, `jump` set by a ">" before it
 */
function splitOnConnectors(text: string): { text: string; jump: boolean }[] {
  const segments: { text: string; jump: boolean }[] = [];
  let current = "";
  let jump = false;
  let depth = 0;

  for (const char of text) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }

    if (depth === 0 && (char === "~" || char === ">")) {
      segments.push({ text: current, jump });
      current = "";
      jump = char === ">";
      continue;
    }

    current += char;
  }

  segments.push({ text: current, jump });

  return segments;
}

/**
 * Read one "bar|beat value (display)" segment.
 * @param segment - The text between two connectors
 * @param jump - Whether a ">" preceded it
 * @param meter - The clip meter the time is spelled in
 * @returns The point, with its time in Ableton beats
 * @throws If the segment isn't a point, or its value isn't a finite number
 */
function parsePoint(
  segment: string,
  jump: boolean,
  meter: EnvelopeMeter,
): EnvelopeNotationPoint {
  const token = segment.trim();

  if (token === "") {
    throw new Error(
      `Invalid envelope notation: a "~" or ">" connector needs a point on each side, like "1|1 0 ~ 2|1 1"`,
    );
  }

  const match = POINT.exec(token);

  if (match == null) {
    throw new Error(
      `Invalid envelope point: "${token}". Expected "bar|beat value", like "1|1 0.5"`,
    );
  }

  const barBeat = match[1] as string;
  const valueText = match[2] as string;

  if (!VALUE.test(valueText)) {
    throw new Error(
      `Invalid envelope value: "${valueText}" in "${token}". Expected a number, like 0.5 or -1`,
    );
  }

  const value = Number(valueText);

  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid envelope value: "${valueText}" in "${token}". Expected a finite number`,
    );
  }

  validateBarBeatPosition(barBeat);

  return {
    time: barBeatToAbletonBeats(
      barBeat,
      meter.timeSigNumerator,
      meter.timeSigDenominator,
    ),
    value,
    jump,
  };
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
  points: EnvelopeNotationPoint[],
  point: EnvelopeNotationPoint,
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
