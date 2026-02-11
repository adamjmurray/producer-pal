// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Waveform generator functions for transform system.
 * All waveforms at phase 0 start at peak (1.0) and descend.
 * Phase is normalized (0.0-1.0 represents one complete cycle).
 */

/**
 * Cosine wave generator
 * @param phase - Phase in cycles (0.0-1.0)
 * @returns Value in range [-1.0, 1.0]
 */
export function cos(phase: number): number {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;

  // cos(0) = 1, descending to -1 at 0.5, back to 1 at 1.0
  return Math.cos(normalizedPhase * 2 * Math.PI);
}

/**
 * Triangle wave generator
 * @param phase - Phase in cycles (0.0-1.0)
 * @returns Value in range [-1.0, 1.0]
 */
export function tri(phase: number): number {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;

  // Starts at 1.0, descends linearly to -1.0 at phase 0.5, returns to 1.0 at phase 1.0
  if (normalizedPhase <= 0.5) {
    // Descending: 1.0 -> -1.0 over first half
    return 1.0 - 4.0 * normalizedPhase;
  }

  // Ascending: -1.0 -> 1.0 over second half
  return -3.0 + 4.0 * normalizedPhase;
}

/**
 * Sawtooth wave generator
 * @param phase - Phase in cycles (0.0-1.0)
 * @returns Value in range [-1.0, 1.0]
 */
export function saw(phase: number): number {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;

  // Starts at 1.0, descends linearly to -1.0, then jumps back to 1.0
  return 1.0 - 2.0 * normalizedPhase;
}

/**
 * Square wave generator
 * @param phase - Phase in cycles (0.0-1.0)
 * @param pulseWidth - Duty cycle (0.0-1.0), default 50%
 * @returns Value in range [-1.0, 1.0]
 */
export function square(phase: number, pulseWidth = 0.5): number {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;

  // Starts high (1.0) for first pulseWidth fraction, then low (-1.0)
  return normalizedPhase < pulseWidth ? 1.0 : -1.0;
}

/**
 * Ramp generator - linearly interpolates from start to end
 * @param phase - Phase in cycles (0.0-1.0)
 * @param start - Starting value
 * @param end - Ending value
 * @param speed - Speed multiplier (must be > 0)
 * @returns Interpolated value between start and end
 */
export function ramp(
  phase: number,
  start: number,
  end: number,
  speed = 1,
): number {
  // Apply speed multiplier and normalize to 0-1 range
  const scaledPhase = (phase * speed) % 1.0;

  // Linear interpolation from start to end
  return start + (end - start) * scaledPhase;
}

/**
 * Random value generator
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Random value in range [min, max]
 */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Random selection from options
 * @param options - Array of values to choose from (at least 1 element, enforced by caller)
 * @returns One randomly selected value
 */
export function choose(options: number[]): number {
  const index = Math.floor(Math.random() * options.length);
  // Index always valid: options has >= 1 element (enforced by caller)

  return options[index] as number;
}

/**
 * Curve generator - exponentially interpolates from start to end
 * @param phase - Phase in cycles (0.0-1.0)
 * @param start - Starting value
 * @param end - Ending value
 * @param exponent - Curve exponent (must be > 0; >1: slow start, <1: fast start, 1: linear)
 * @returns Interpolated value between start and end
 */
export function curve(
  phase: number,
  start: number,
  end: number,
  exponent: number,
): number {
  const scaledPhase = phase % 1.0;
  const curvedPhase = Math.pow(scaledPhase, exponent);

  return start + (end - start) * curvedPhase;
}
