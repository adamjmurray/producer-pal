/**
 * Re-exports pitch class conversion utilities from canonical source.
 * @see src/shared/pitch.js for the canonical implementation.
 */

export {
  PITCH_CLASS_VALUES,
  VALID_PITCH_CLASS_NAMES,
  pitchClassToNumber,
  isValidPitchClassName,
} from "#src/shared/pitch.js";

// Alias for backwards compatibility
export { pitchClassToNumber as pitchClassNameToNumber } from "#src/shared/pitch.js";
