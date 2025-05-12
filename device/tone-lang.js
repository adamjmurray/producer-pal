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
      // Advance time by timeUntilNext if specified, otherwise by duration
      currentTime += note.timeUntilNext ?? note.duration ?? DEFAULT_DURATION;
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
      // Advance time by timeUntilNext if specified, otherwise by duration
      currentTime += chord.timeUntilNext ?? chordDuration;
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

  try {
    const ast = parser.parse(toneLangExpression);

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
  } catch (error) {
    if (error.name === "SyntaxError") {
      // Extract useful information from the Peggy error
      const location = error.location || {};
      const position = location.start
        ? `at position ${location.start.offset} (line ${location.start.line}, column ${location.start.column})`
        : "at unknown position";

      // Build a more helpful error message
      let helpfulMessage = `ToneLang syntax error ${position}: `;

      // Add a hint based on the character that caused the error
      const invalidChar = error.found || "";

      if (/^\d+$/.test(invalidChar)) {
        helpfulMessage += `Unexpected number. Numbers must follow a modifier like 'n' for duration or 'v' for velocity.`;
      } else if (invalidChar === ".") {
        helpfulMessage += `Decimal points must be preceded by a number or a modifier (e.g., 'n0.5' or 'n.5').`;
      } else {
        // General case
        helpfulMessage += `Unexpected '${invalidChar}'. Valid syntax includes note names (C-G with optional # or b), `;
        helpfulMessage += `velocity (v), duration (n), time until next (t), rests (R), or chords using [].`;
      }

      throw new Error(helpfulMessage);
    }
    // Re-throw other errors
    throw error;
  }
}

module.exports = {
  parseToneLang,
  midiPitchToName,
  DEFAULT_DURATION,
  DEFAULT_VELOCITY,
};
