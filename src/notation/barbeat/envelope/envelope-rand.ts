// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A random point value, `rand(0.5, 1)`: the transforms' rand(), rolled once per
// point when the envelope is written.

import { rand } from "#src/notation/transform/transform-waveforms.ts";

/** A point's value: a plain decimal, or an exponent form we still accept. */
export const ENVELOPE_VALUE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/** `rand(...)`, or the `random(...)` models guess. */
const RAND = /^rand(?:om)?\((.*)\)$/s;

/** A display value as one end: `(2 kHz)`. */
const DISPLAY_END = /^\(([^()]*)\)$/;

/** Rolled values keep this many significant digits: a write has a size limit. */
const RAND_DIGITS = 6;

/** One end of a range: a raw number, or the display that stands for one. */
export type EnvelopeRandEnd = number | { display: string };

/** The range a random value is drawn from. */
export interface EnvelopeRand<End = EnvelopeRandEnd> {
  min: End;
  max: End;
}

/**
 * Read a point value as a `rand()` call.
 * @param value - The value as written
 * @returns The range to draw from, or undefined when it isn't a rand() call
 * @throws If the call's arguments aren't zero to two numbers or display values
 */
export function readEnvelopeRand(value: string): EnvelopeRand | undefined {
  const inside = RAND.exec(value)?.[1];

  if (inside == null) {
    return undefined;
  }

  const ends = splitArguments(inside).map((arg) => readEnd(arg));
  const [first, second] = ends;
  const displays = ends.some((end) => typeof end === "object");

  // A display end has no raw 0 to pair with, so it needs both ends written.
  if (
    ends.includes(undefined) ||
    ends.length > 2 ||
    (displays && second == null)
  ) {
    throw new Error(
      `Invalid envelope value: "${value}". rand takes numbers, or display values in parentheses: rand(min, max), rand((200 Hz), (2 kHz)), rand(max) for 0 to max, or rand() for -1 to 1`,
    );
  }

  if (first == null) {
    return { min: -1, max: 1 };
  }

  return second == null ? { min: 0, max: first } : { min: first, max: second };
}

/**
 * Whether a range is spelled in raw numbers alone.
 * @param range - The range
 * @returns True when neither end is a display value
 */
export function isRawRand(range: EnvelopeRand): range is EnvelopeRand<number> {
  return typeof range.min === "number" && typeof range.max === "number";
}

/**
 * Roll one value from a raw range.
 * @param min - One end
 * @param max - The other end
 * @returns A value between them
 */
export function rollEnvelopeRand(min: number, max: number): number {
  const rolled = Number(rand(min, max).toPrecision(RAND_DIGITS));

  // Rounding must not carry a roll past an end that sits on the range's limit.
  return Math.min(Math.max(rolled, Math.min(min, max)), Math.max(min, max));
}

/**
 * Cut a call's arguments at the commas outside any parentheses.
 * @param inside - The text between the call's parentheses
 * @returns The arguments, trimmed; none for an empty call
 */
function splitArguments(inside: string): string[] {
  if (inside.trim() === "") {
    return [];
  }

  const args = [""];
  let depth = 0;

  for (const char of inside) {
    depth += char === "(" ? 1 : char === ")" ? -1 : 0;

    if (char === "," && depth === 0) {
      args.push("");
    } else {
      args[args.length - 1] += char;
    }
  }

  return args.map((arg) => arg.trim());
}

/**
 * Read one end of a range.
 * @param arg - The argument as written
 * @returns The number or display value, or undefined when it is neither
 */
function readEnd(arg: string): EnvelopeRandEnd | undefined {
  if (ENVELOPE_VALUE.test(arg)) {
    const end = Number(arg);

    return Number.isFinite(end) ? end : undefined;
  }

  const display = DISPLAY_END.exec(arg)?.[1]?.trim();

  // A read prints a display's round brackets as square ones; undo that.
  return display == null || display === ""
    ? undefined
    : { display: display.replaceAll("[", "(").replaceAll("]", ")") };
}
