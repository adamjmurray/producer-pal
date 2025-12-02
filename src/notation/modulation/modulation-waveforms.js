/**
 * Waveform generator functions for modulation system.
 * All waveforms at phase 0 start at peak (1.0) and descend.
 * Phase is normalized (0.0-1.0 represents one complete cycle).
 */

/**
 * Cosine wave generator
 * @param {number} phase - Phase in cycles (0.0-1.0)
 * @returns {number} Value in range [-1.0, 1.0]
 */
export function cos(phase) {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;
  // cos(0) = 1, descending to -1 at 0.5, back to 1 at 1.0
  return Math.cos(normalizedPhase * 2 * Math.PI);
}

/**
 * Triangle wave generator
 * @param {number} phase - Phase in cycles (0.0-1.0)
 * @returns {number} Value in range [-1.0, 1.0]
 */
export function tri(phase) {
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
 * @param {number} phase - Phase in cycles (0.0-1.0)
 * @returns {number} Value in range [-1.0, 1.0]
 */
export function saw(phase) {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;
  // Starts at 1.0, descends linearly to -1.0, then jumps back to 1.0
  return 1.0 - 2.0 * normalizedPhase;
}

/**
 * Square wave generator
 * @param {number} phase - Phase in cycles (0.0-1.0)
 * @param {number} [pulseWidth=0.5] - Duty cycle (0.0-1.0), default 50%
 * @returns {number} Value in range [-1.0, 1.0]
 */
export function square(phase, pulseWidth = 0.5) {
  // Normalize phase to 0-1 range
  const normalizedPhase = phase % 1.0;
  // Starts high (1.0) for first pulseWidth fraction, then low (-1.0)
  return normalizedPhase < pulseWidth ? 1.0 : -1.0;
}

/**
 * Random noise generator (non-deterministic)
 * @returns {number} Random value in range [-1.0, 1.0]
 */
export function noise() {
  // Generate random value between -1.0 and 1.0
  return Math.random() * 2.0 - 1.0;
}

/**
 * Ramp generator - linearly interpolates from start to end
 * @param {number} phase - Phase in cycles (0.0-1.0)
 * @param {number} start - Starting value
 * @param {number} end - Ending value
 * @param {number} [speed=1] - Speed multiplier (must be > 0)
 * @returns {number} Interpolated value between start and end
 */
export function ramp(phase, start, end, speed = 1) {
  // Apply speed multiplier and normalize to 0-1 range
  const scaledPhase = (phase * speed) % 1.0;
  // Linear interpolation from start to end
  return start + (end - start) * scaledPhase;
}
