// src/notation/pitch-class-name-to-number.js

/**
 * Mapping from pitch class names to numbers (0-11)
 * Supports both sharp and flat enharmonic equivalents
 */
export const PITCH_CLASS_VALUES = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

/**
 * Array of all valid pitch class names for validation
 */
export const VALID_PITCH_CLASS_NAMES = Object.keys(PITCH_CLASS_VALUES);

/**
 * Convert pitch class name to number
 * @param {string} pitchClassName - Pitch class name like "C", "F#", "Bb"
 * @returns {number} Pitch class number (0-11)
 * @throws {Error} If pitch class name is invalid
 */
export function pitchClassNameToNumber(pitchClassName) {
  if (typeof pitchClassName !== "string") {
    throw new Error(
      `Invalid pitch class: must be a string, got ${typeof pitchClassName}`,
    );
  }

  const pitchClassNumber = PITCH_CLASS_VALUES[pitchClassName];
  if (pitchClassNumber === undefined) {
    throw new Error(
      `Invalid pitch class "${pitchClassName}". Must be one of: ${VALID_PITCH_CLASS_NAMES.join(", ")}`,
    );
  }

  return pitchClassNumber;
}

/**
 * Validate if a string is a valid pitch class name
 * @param {string} pitchClassName - Pitch class name to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidPitchClassName(pitchClassName) {
  return (
    typeof pitchClassName === "string" && pitchClassName in PITCH_CLASS_VALUES
  );
}
