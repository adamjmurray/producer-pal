// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Curved ramps: the notation's `~N` amount (-1..1) as the cubic bezier Live
// stores on the event that starts a segment.
//
// The bezier is `x1, y1, x2, y2` in a 0..1 box: x is the fraction of the
// segment's time, y the fraction of the way from the start value to the end
// value, so a falling ramp shapes the same way as a rising one. `0.5` four times
// is straight. Every curve Live's editor draws is one amount `t` (0..1) on one
// side, which is all this writes:
//
//   slow start (y below x): P1 = (.25 + .75t, .25 - .25t), P2 = (.75 + .25t, .75 - .75t)
//   fast start (y above x): P1 = (.25 - .25t, .25 + .75t), P2 = (.75 - .75t, .75 + .25t)
//
// A positive amount bends above the straight line, a negative one below it.
// For a rising ramp that is a fast and a slow start; for a falling ramp the
// other way round. Live's editor rounds each coefficient to 1/256.

/** `x1, y1, x2, y2` of a segment's bezier. */
export type CurveCoefficients = [number, number, number, number];

/** What Live stores for a straight segment. */
export const STRAIGHT_COEFFICIENTS: CurveCoefficients = [0.5, 0.5, 0.5, 0.5];

/** The curve at t = 0 and its change per unit of t, on each side. */
const ORIGIN = [0.25, 0.25, 0.75, 0.75] as const;
const SLOW_START = [0.75, -0.25, 0.25, -0.75] as const;
const FAST_START = [-0.25, 0.75, -0.75, 0.25] as const;

type Direction = readonly [number, number, number, number];

/**
 * The coefficients that draw a curve.
 * @param amount - -1..1; 0 is straight, positive bends above the straight line
 * @param rising - Whether the segment ends higher than it starts
 * @returns The coefficients to store on the event that starts the segment
 */
export function curveToCoefficients(
  amount: number,
  rising: boolean,
): CurveCoefficients {
  if (amount === 0) {
    return [...STRAIGHT_COEFFICIENTS];
  }

  const t = Math.abs(amount);
  // Bending above is a fast start when rising and a slow one when falling.
  const direction = amount > 0 !== rising ? SLOW_START : FAST_START;

  return ORIGIN.map(
    (origin, i) =>
      Math.round((origin + (direction[i] as number) * t) * 1e6) / 1e6,
  ) as CurveCoefficients;
}

/**
 * The amount that draws these coefficients. One that isn't on Live's family
 * (from another source) reads as the nearest amount.
 * @param coefficients - What Live stores on the event that starts the segment
 * @param rising - Whether the segment ends higher than it starts
 * @returns -1..1 in hundredths; 0 when the segment reads as straight
 */
export function coefficientsToCurve(
  coefficients: CurveCoefficients,
  rising: boolean,
): number {
  const slow = fitSide(coefficients, SLOW_START);
  const fast = fitSide(coefficients, FAST_START);
  const straightError = coefficients.reduce(
    (sum, value) => sum + (value - 0.5) ** 2,
    0,
  );

  // Live's straight line isn't the t = 0 point of either side.
  if (straightError <= slow.error && straightError <= fast.error) {
    return 0;
  }

  const best = slow.error < fast.error ? slow : fast;
  const bendsAbove = (best === slow) !== rising;
  const amount = Math.round(best.t * 100) / 100;

  return amount === 0 ? 0 : bendsAbove ? amount : -amount;
}

// --- Helpers below main exports ---

/**
 * Least-squares fit of one side's family to the coefficients.
 * @param coefficients - The coefficients to fit
 * @param direction - One side's change per unit of t
 * @returns The best t in 0..1 and how far off it still is
 */
function fitSide(
  coefficients: CurveCoefficients,
  direction: Direction,
): { t: number; error: number } {
  // How far each coefficient sits from where t = 0 would put it.
  const offsets = coefficients.map((c, i) => c - (ORIGIN[i] as number));
  let dot = 0;
  let size = 0;

  for (const [i, change] of direction.entries()) {
    dot += change * (offsets[i] as number);
    size += change * change;
  }

  const t = Math.min(1, Math.max(0, dot / size));
  let error = 0;

  for (const [i, change] of direction.entries()) {
    error += ((offsets[i] as number) - change * t) ** 2;
  }

  return { t, error };
}
