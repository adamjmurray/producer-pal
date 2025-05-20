// src/tone-lang/tone-lang.js
import * as parser from "./parser";

export const DEFAULT_DURATION = 1;
export const DEFAULT_VELOCITY = 70;

export const PITCH_CLASS_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Convert MIDI pitch number to note name (e.g., 60 -> "C3")
 * @param {number} pitch - MIDI pitch number
 * @returns {string} Pitch name in the ToneLang format like "C3", "F#4", etc, or empty string for invalid inputs.
 */
export function midiPitchToName(midiPitch) {
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
  // Helper function to process a sequence of elements
  function processSequence(elements, startTime) {
    const events = [];
    let currentTime = startTime;

    for (const element of elements) {
      if (element.type === "rest") {
        currentTime += element.duration ?? DEFAULT_DURATION;
      } else if (element.type === "note") {
        events.push({
          pitch: element.pitch,
          start_time: currentTime,
          duration: element.duration ?? DEFAULT_DURATION,
          velocity: element.velocity ?? DEFAULT_VELOCITY,
        });
        currentTime += element.timeUntilNext ?? element.duration ?? DEFAULT_DURATION;
      } else if (element.type === "chord") {
        const chordDuration = element.duration ?? DEFAULT_DURATION;
        const chordVelocity = element.velocity ?? DEFAULT_VELOCITY;
        for (const note of element.notes) {
          events.push({
            pitch: note.pitch,
            start_time: currentTime,
            duration: note.duration ?? chordDuration,
            velocity: note.velocity ?? chordVelocity,
          });
        }
        currentTime += element.timeUntilNext ?? chordDuration;
      } else if (element.type === "repetition") {
        // Process the content of the repetition once to get the events and duration
        const [contentEvents, contentDuration] = processSequence(element.content, 0);

        // Repeat the content the specified number of times
        for (let i = 0; i < element.repeat; i++) {
          for (const event of contentEvents) {
            events.push({
              ...event,
              start_time: currentTime + event.start_time,
            });
          }
          currentTime += contentDuration;
        }
      }
    }

    return [events, currentTime - startTime];
  }

  // Process the AST based on whether it's single or multiple voices
  if (Array.isArray(ast) && ast.length > 0 && Array.isArray(ast[0])) {
    // Multiple voices
    const allEvents = [];
    for (const voice of ast) {
      const [voiceEvents] = processSequence(voice, 0);
      allEvents.push(...voiceEvents);
    }
    return allEvents;
  } else {
    // Single voice
    const [events] = processSequence(ast, 0);
    return events;
  }
}

/**
 * Parse a full ToneLang string and convert to note events
 * @param {string} toneLangExpression - ToneLang string
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
export function parseToneLang(toneLangExpression) {
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
