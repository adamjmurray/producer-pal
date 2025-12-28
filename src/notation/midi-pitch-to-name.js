import { PITCH_CLASS_NAMES } from "#src/shared/pitch.js";

/**
 * Re-exports pitch conversion utilities from canonical source.
 * @see src/shared/pitch.js for the canonical implementation.
 */

// Re-export core pitch utilities
export {
  PITCH_CLASS_NAMES,
  midiToPitchName,
  pitchNameToMidi,
} from "#src/shared/pitch.js";

// Alias for backwards compatibility
export { midiToPitchName as midiPitchToName } from "#src/shared/pitch.js";
export { pitchNameToMidi as nameToMidiPitch } from "#src/shared/pitch.js";

/**
 * Convert scale intervals to pitch class names using the given root note.
 * @param {number[]} intervals - Array of semitone intervals from root (e.g., [0, 2, 4, 5, 7, 9, 11])
 * @param {number} rootNote - Root note number (0-11, where 0 = C)
 * @returns {string[]} Array of pitch class names (e.g., ["C", "D", "E", "F", "G", "A", "B"])
 */
export function intervalsToPitchClasses(intervals, rootNote) {
  return intervals.map((interval) => {
    const pitchClass = (rootNote + interval) % 12;

    return PITCH_CLASS_NAMES[pitchClass];
  });
}
