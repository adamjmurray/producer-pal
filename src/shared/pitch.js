/**
 * Canonical pitch conversion utilities.
 *
 * This module is the single source of truth for pitch↔MIDI conversions.
 * Other modules should import from here rather than defining their own.
 *
 * Output format: Uses flats (Db, Eb, Gb, Ab, Bb) per music theory convention.
 * Input format: Accepts both sharps and flats, case-insensitive.
 *
 * Note: src/notation/modulation/parser/modulation-grammar.peggy has an inline
 * copy of PITCH_CLASS_VALUES because Peggy cannot import JS modules.
 */

/**
 * Pitch class names using flats (music theory convention).
 * Index corresponds to semitones above C (0-11).
 * @type {readonly string[]}
 */
export const PITCH_CLASS_NAMES = Object.freeze([
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
]);

/**
 * Mapping from pitch class names to semitone values (0-11).
 * Supports both sharps and flats for input flexibility.
 * @type {Readonly<Record<string, number>>}
 */
export const PITCH_CLASS_VALUES = Object.freeze({
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
});

/**
 * Lowercase mapping for case-insensitive pitch class lookup.
 * @type {Readonly<Record<string, number>>}
 */
const PITCH_CLASS_VALUES_LOWERCASE = Object.freeze(
  Object.fromEntries(
    Object.entries(PITCH_CLASS_VALUES).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  ),
);

/**
 * Array of valid pitch class name strings.
 * @type {readonly string[]}
 */
export const VALID_PITCH_CLASS_NAMES = Object.freeze(
  Object.keys(PITCH_CLASS_VALUES),
);

/**
 * Check if a MIDI note number is valid (0-127).
 * @param {unknown} midi - Value to check
 * @returns {boolean} True if valid MIDI number
 */
export function isValidMidi(midi) {
  return (
    typeof midi === "number" &&
    Number.isInteger(midi) &&
    midi >= 0 &&
    midi <= 127
  );
}

/**
 * Check if a string is a valid pitch name (e.g., "C3", "F#4", "Bb-1").
 * Case-insensitive.
 * @param {unknown} name - Value to check
 * @returns {boolean} True if valid pitch name
 */
export function isValidPitchName(name) {
  if (typeof name !== "string") return false;

  const match = name.match(/^([A-Ga-g][#bB]?)(-?\d+)$/);

  if (!match) return false;

  const pitchClass = match[1].toLowerCase();

  return pitchClass in PITCH_CLASS_VALUES_LOWERCASE;
}

/**
 * Check if a string is a valid pitch class name (without octave).
 * Case-insensitive.
 * @param {unknown} name - Value to check
 * @returns {boolean} True if valid pitch class name
 */
export function isValidPitchClassName(name) {
  if (typeof name !== "string") return false;

  return name.toLowerCase() in PITCH_CLASS_VALUES_LOWERCASE;
}

/**
 * Convert pitch class name to semitone number (0-11).
 * Case-insensitive.
 * @param {string} name - Pitch class name (e.g., "C", "F#", "Bb")
 * @returns {number} Semitone number (0-11)
 * @throws {Error} If pitch class name is invalid
 */
export function pitchClassToNumber(name) {
  if (typeof name !== "string") {
    throw new Error(
      `Invalid pitch class: must be a string, got ${typeof name}`,
    );
  }

  const value = PITCH_CLASS_VALUES_LOWERCASE[name.toLowerCase()];

  if (value === undefined) {
    throw new Error(
      `Invalid pitch class "${name}". Valid names: ${VALID_PITCH_CLASS_NAMES.join(", ")}`,
    );
  }

  return value;
}

/**
 * Convert semitone number to pitch class name.
 * Always outputs using flats (Db, Eb, Gb, Ab, Bb).
 * @param {number} num - Semitone number (0-11)
 * @returns {string} Pitch class name
 * @throws {Error} If number is out of range
 */
export function numberToPitchClass(num) {
  if (
    typeof num !== "number" ||
    !Number.isInteger(num) ||
    num < 0 ||
    num > 11
  ) {
    throw new Error(
      `Invalid pitch class number: ${num}. Must be integer 0-11.`,
    );
  }

  return PITCH_CLASS_NAMES[num];
}

/**
 * Convert MIDI note number to pitch name (e.g., 60 → "C3").
 * Always outputs using flats (Db, Eb, Gb, Ab, Bb).
 * @param {number} midi - MIDI note number (0-127)
 * @returns {string} Pitch name
 * @throws {Error} If MIDI number is invalid
 */
export function midiToPitchName(midi) {
  if (!isValidMidi(midi)) {
    throw new Error(
      `Invalid MIDI note number: ${midi}. Must be integer 0-127.`,
    );
  }

  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 2;

  return `${PITCH_CLASS_NAMES[pitchClass]}${octave}`;
}

/**
 * Convert pitch name to MIDI note number (e.g., "C3" → 60).
 * Case-insensitive, accepts both sharps and flats.
 * @param {string} name - Pitch name (e.g., "C3", "F#4", "Bb-1", "c#3")
 * @returns {number} MIDI note number (0-127)
 * @throws {Error} If pitch name is invalid or results in out-of-range MIDI
 */
export function pitchNameToMidi(name) {
  if (typeof name !== "string" || name.length < 2) {
    throw new Error(`Invalid note name: ${name}`);
  }

  const match = name.match(/^([A-Ga-g][#bB]?)(-?\d+)$/);

  if (!match) {
    throw new Error(`Invalid note name format: ${name}`);
  }

  const [, pitchClassName, octaveStr] = match;
  const pitchClass = pitchClassToNumber(pitchClassName);
  const octave = parseInt(octaveStr, 10);

  // MIDI note = (octave + 2) * 12 + pitchClass
  // C3 = (3 + 2) * 12 + 0 = 60
  const midi = (octave + 2) * 12 + pitchClass;

  if (midi < 0 || midi > 127) {
    throw new Error(
      `Note name "${name}" results in MIDI ${midi}, which is outside valid range 0-127.`,
    );
  }

  return midi;
}
