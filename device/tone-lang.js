// device/tone-lang.js
const parser = require("./tone-lang-parser");

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
      events.push({
        pitch: item.pitch,
        start_time: currentTime,
        duration: item.duration,
        velocity: item.velocity,
      });
      currentTime += item.duration;
    } else if (item.type === "chord") {
      for (const noteObj of item.notes) {
        events.push({
          pitch: noteObj.pitch,
          start_time: currentTime,
          duration: item.duration,
          velocity: item.velocity,
        });
      }
      currentTime += item.duration;
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
