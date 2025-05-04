// device/tone-lang.js

/**
 * Parse a single ToneLang note name (e.g. "C3", "Bb2") to MIDI pitch
 * @param {string} note - The note name to parse
 * @returns {number|null} MIDI pitch value, or null if invalid
 */
function parseToneLangNote(note) {
  const pitchClasses = {
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

  // Match note name, accidental, and octave
  const match = note.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!match) return null;

  const [, letter, accidental, octave] = match;
  const noteKey = letter + accidental;
  const pitchClass = pitchClasses[noteKey];

  if (pitchClass === undefined) return null;

  // MIDI formula: (octave + 2) * 12 + pitch class
  return (Number(octave) + 2) * 12 + pitchClass;
}

/**
 * Parse a ToneLang music notation string into an array of note objects
 * @param {string} musicString - ToneLang notation string
 * @param {number} [duration=1.0] - Default duration of each note in quarter notes
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>} Array of note objects
 */
function parseToneLang(musicString, duration = 1.0) {
  if (!musicString) return [];

  const notes = [];
  let currentTime = 0;

  // Split by whitespace but preserve chord groupings
  const tokens = musicString.match(/\[.*?\]|\S+/g) || [];

  for (const token of tokens) {
    if (token.startsWith("[") && token.endsWith("]")) {
      // Parse chord
      const chordNotes = token.slice(1, -1).split(/\s+/);
      for (const noteStr of chordNotes) {
        const pitch = parseToneLangNote(noteStr);
        if (pitch !== null) {
          notes.push({
            pitch,
            start_time: currentTime,
            duration,
            velocity: 100,
          });
        }
      }
      currentTime += duration;
    } else {
      // Parse single note
      const pitch = parseToneLangNote(token);
      if (pitch !== null) {
        notes.push({
          pitch,
          start_time: currentTime,
          duration,
          velocity: 100,
        });
        currentTime += duration;
      }
    }
  }

  return notes;
}

module.exports = { parseToneLangNote, parseToneLang };
