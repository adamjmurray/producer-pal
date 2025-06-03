// src/notation/midi-pitch-to-name.js
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
 * @param {number} pitch - MIDI pitch number
 * @returns {string} Pitch name in the notation format like "C3", "F#4", etc, or empty string for invalid inputs.
 */
export function midiPitchToName(midiPitch) {
  const pitchClass = midiPitch % 12;
  const octave = Math.floor(midiPitch / 12) - 2;
  return `${PITCH_CLASS_NAMES[pitchClass]}${octave}`;
}
