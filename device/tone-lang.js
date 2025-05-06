// device/tone-lang.js

const parser = require("./tone-lang-parser"); // Peggy-generated parser

/**
 * Convert parsed ToneLang AST into note events with timing
 * @param {Array} ast - Parsed AST from Peggy parser
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
function convertToneLangAstToEvents(ast) {
  const events = [];
  let currentTime = 0;

  for (const item of ast) {
    if (item.type === "rest") {
      currentTime += item.duration;
    } else if (item.type === "note") {
      const midiPitch = parseToneLangNote(item.pitch);
      if (midiPitch !== null) {
        events.push({
          pitch: midiPitch,
          start_time: currentTime,
          duration: item.duration,
          velocity: item.velocity,
        });
      }
      currentTime += item.duration;
    } else if (item.type === "chord") {
      for (const noteObj of item.notes) {
        const midiPitch = parseToneLangNote(noteObj.pitch);
        if (midiPitch !== null) {
          events.push({
            pitch: midiPitch,
            start_time: currentTime,
            duration: item.duration,
            velocity: item.velocity,
          });
        }
      }
      currentTime += item.duration;
    }
  }

  return events;
}

/**
 * Parse a single ToneLang note name (e.g., 'C3', 'Bb2') into MIDI pitch
 * @param {string} note - Note name
 * @returns {number|null} MIDI pitch or null if invalid
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

  const match = note.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return null;

  const [, letter, accidental, octave] = match;
  const key = letter.toUpperCase() + (accidental || "");
  const pitchClass = pitchClasses[key];

  if (pitchClass === undefined) return null;

  return (Number(octave) + 2) * 12 + pitchClass;
}

/**
 * Parse a full ToneLang string and convert to note events
 * @param {string} musicString - ToneLang string
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
function parseToneLang(musicString) {
  if (!musicString) return [];

  const ast = parser.parse(musicString);

  // Check if this is a multi-voice AST (array of arrays)
  if (Array.isArray(ast) && ast.length > 0 && Array.isArray(ast[0]) && ast[0].type === undefined) {
    // Process multiple voices
    const allEvents = [];
    for (const voice of ast) {
      const voiceEvents = convertToneLangAstToEvents(voice);
      allEvents.push(...voiceEvents);
    }
    return allEvents;
  }

  // Single voice (backward compatible format)
  return convertToneLangAstToEvents(ast);
}

module.exports = {
  parseToneLang,
};
