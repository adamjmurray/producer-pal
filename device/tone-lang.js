// device/tone-lang.js
const parser = require("./tone-lang-parser");

const DEFAULT_DURATION = 1;
const DEFAULT_VELOCITY = 70;

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
};
