// device/tone-lang.js
const parser = require("./tone-lang-parser");

const DEFAULT_DURATION = 1;
const DEFAULT_VELOCITY = 70;

const PITCH_CLASS_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Convert MIDI pitch number to note name (e.g., 60 -> "C3")
 * @param {number} pitch - MIDI pitch number
 * @returns {string} Pitch name in the ToneLang format like "C3", "F#4", etc, or empty string for invalid inputs.
 */
function midiPitchToName(midiPitch) {
  if (midiPitch >= 0 && midiPitch <= 127) {
    const pitchClass = midiPitch % 12;
    const octave = Math.floor(midiPitch / 12) - 2;
    return `${PITCH_CLASS_NAMES[pitchClass]}${octave}`;
  }
  return "";
}

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
      const rest = item;
      currentTime += rest.duration ?? DEFAULT_DURATION;
    } else if (item.type === "note") {
      const note = item;
      events.push({
        pitch: note.pitch,
        start_time: currentTime,
        duration: note.duration ?? DEFAULT_DURATION,
        velocity: note.velocity ?? DEFAULT_VELOCITY,
      });
      currentTime += item.duration ?? DEFAULT_DURATION;
    } else if (item.type === "chord") {
      const chord = item;
      const chordDuration = chord.duration ?? DEFAULT_DURATION;
      const chordVelocity = chord.velocity ?? DEFAULT_VELOCITY;
      for (const note of item.notes) {
        events.push({
          pitch: note.pitch,
          start_time: currentTime,
          duration: note.duration ?? chordDuration,
          velocity: note.velocity ?? chordVelocity,
        });
      }
      currentTime += chordDuration;
    }
  }

  return events;
}

/**
 * Parse a full ToneLang string and convert to note events
 * @param {string} toneLangExpression - ToneLang string
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
function parseToneLang(toneLangExpression) {
  if (!toneLangExpression) return [];

  const ast = parser.parse(toneLangExpression);

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

  // Single voice
  return convertToneLangAstToEvents(ast);
}

module.exports = {
  parseToneLang,
  midiPitchToName,
  DEFAULT_DURATION,
  DEFAULT_VELOCITY,
};
