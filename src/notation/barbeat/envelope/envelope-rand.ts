// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A random point value, `rand(0.5, 1)`: the transforms' rand(), rolled once per
// point when the envelope is written.

/** A point's value: a plain decimal, or an exponent form we still accept. */
export const ENVELOPE_VALUE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/** `rand(...)`, or the `random(...)` models guess. */
const RAND = /^rand(?:om)?\((.*)\)$/s;

/** The range a random value is drawn from. */
export interface EnvelopeRand {
  min: number;
  max: number;
}

/**
 * Read a point value as a `rand()` call.
 * @param value - The value as written
 * @returns The range to draw from, or undefined when it isn't a rand() call
 * @throws If the call's arguments aren't zero to two numbers
 */
export function readEnvelopeRand(value: string): EnvelopeRand | undefined {
  const inside = RAND.exec(value)?.[1];

  if (inside == null) {
    return undefined;
  }

  const args =
    inside.trim() === "" ? [] : inside.split(",").map((arg) => arg.trim());

  if (args.length > 2 || !args.every((arg) => ENVELOPE_VALUE.test(arg))) {
    throw new Error(
      `Invalid envelope value: "${value}". rand takes plain numbers: rand(min, max), rand(max) for 0 to max, or rand() for -1 to 1`,
    );
  }

  const [first, second] = args.map(Number);

  if (![first, second].every((arg) => arg == null || Number.isFinite(arg))) {
    throw new Error(
      `Invalid envelope value: "${value}". rand needs finite numbers`,
    );
  }

  if (first == null) {
    return { min: -1, max: 1 };
  }

  return second == null ? { min: 0, max: first } : { min: first, max: second };
}
