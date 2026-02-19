// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Waveform generator functions for transform system.
 * cos, square: start at peak (1.0) at phase 0.
 * sin, tri, saw: start at zero (0.0) at phase 0, rising to peak.
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
 * Sine wave generator
 * @param phase - Phase in cycles (0.0-1.0)
 * @returns Value in range [-1.0, 1.0]
 */
export function sin(phase: number): number {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;

  // sin(0) = 0, rising to 1.0 at 0.25, back to 0 at 0.5, -1.0 at 0.75
  return Math.sin(normalizedPhase * 2 * Math.PI);
}

/**
 * Triangle wave generator
 * @param phase - Phase in cycles (0.0-1.0)
 * @returns Value in range [-1.0, 1.0]
 */
export function tri(phase: number): number {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;

  // Starts at 0.0, rises to 1.0 at 0.25, descends to -1.0 at 0.75, returns to 0.0 at 1.0
  if (normalizedPhase <= 0.25) {
    // Rising: 0.0 -> 1.0
    return 4.0 * normalizedPhase;
  }

  if (normalizedPhase <= 0.75) {
    // Descending: 1.0 -> -1.0
    return 2.0 - 4.0 * normalizedPhase;
  }

  // Rising: -1.0 -> 0.0
  return -4.0 + 4.0 * normalizedPhase;
}

/**
 * Sawtooth wave generator
 * @param phase - Phase in cycles (0.0-1.0)
 * @returns Value in range [-1.0, 1.0]
 */
export function saw(phase: number): number {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;

  // Starts at 0.0, rises to 1.0 at ~0.5, jumps to -1.0, rises back to 0.0
  if (normalizedPhase < 0.5) {
    return 2.0 * normalizedPhase;
  }

  return -2.0 + 2.0 * normalizedPhase;
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
  // Apply speed multiplier and clamp to 0-1 range (reaches end value at phase 1.0)
  const scaledPhase = Math.min(phase * speed, 1.0);

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
  const clampedPhase = Math.min(phase, 1.0);
  const curvedPhase = Math.pow(clampedPhase, exponent);

  return start + (end - start) * curvedPhase;
}
