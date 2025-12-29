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

const PITCH_CLASS_TO_NUMBER = {
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
 * Convert a note name (e.g., "C1" or "F#3") to a MIDI pitch number
 * @param {string} name - Note name using flats or sharps (e.g., C1, Db3, F#4)
 * @returns {number|null} MIDI pitch number 0-127, or null for invalid input
 */
export function midiNameToPitch(name) {
  if (typeof name !== "string") {
    return null;
  }

  const match = name.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);

  if (!match) {
    return null;
  }

  const [, letter, accidental, octaveString] = match;
  const pitchClassName = `${letter.toUpperCase()}${accidental}`;
  const pitchClassNumber = PITCH_CLASS_TO_NUMBER[pitchClassName];

  if (pitchClassNumber == null) {
    return null;
  }

  const octave = Number.parseInt(octaveString, 10);

  if (Number.isNaN(octave)) {
    return null;
  }

  const midi = (octave + 2) * 12 + pitchClassNumber;

  return midi >= 0 && midi <= 127 ? midi : null;
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
