import { pitchClassNameToNumber } from "./pitch-class-name-to-number.js";

export const PITCH_CLASS_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

/**
 * Convert MIDI pitch number to note name (e.g., 60 -> "C3")
 *
 * @param {number} midiPitch - MIDI pitch number (0-127)
 * @returns {string} Pitch name in the notation format like "C3", "F#4", etc, or empty string for invalid inputs.
 */
export function midiPitchToName(midiPitch) {
  const pitchClass = midiPitch % 12;
  const octave = Math.floor(midiPitch / 12) - 2;

  return `${PITCH_CLASS_NAMES[pitchClass]}${octave}`;
}

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

/**
 * Convert note name to MIDI pitch number (e.g., "C3" -> 60)
 * @param {string} noteName - Note name like "C3", "F#4", "Bb2"
 * @returns {number} MIDI pitch number (0-127)
 * @throws {Error} If note name format is invalid
 */
export function nameToMidiPitch(noteName) {
  if (typeof noteName !== "string" || noteName.length < 2) {
    throw new Error(`Invalid note name: ${noteName}`);
  }

  // Parse pitch class (1-2 chars) and octave (rest)
  const match = noteName.match(/^([A-Ga-g][#b]?)(-?\d+)$/);

  if (!match) {
    throw new Error(`Invalid note name format: ${noteName}`);
  }

  const [, pitchClassName, octaveStr] = match;
  const pitchClass = pitchClassNameToNumber(pitchClassName);
  const octave = parseInt(octaveStr, 10);

  // MIDI note = (octave + 2) * 12 + pitchClass
  // C3 = (3 + 2) * 12 + 0 = 60
  return (octave + 2) * 12 + pitchClass;
}
