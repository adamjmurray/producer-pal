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
  const allEvents = [];

  // Process each sequence (AKA voice)
  for (const sequence of ast) {
    let events = [];
    let currentTime = 0;

    // Process each element in sequence
    for (let i = 0; i < sequence.length; i++) {
      const element = sequence[i];
      const elementEvents = processElement(element, currentTime);

      // Add events and update current time
      events.push(...elementEvents.events);
      currentTime += elementEvents.duration;
    }

    allEvents.push(...events);
  }

  return allEvents;
}

// Update processElement function in src/tone-lang/tone-lang.js
function processElement(element, startTime) {
  let events = [];
  let duration = 0;

  switch (element.type) {
    case "note": {
      // Note implementation unchanged
      const noteDuration = element.duration ?? DEFAULT_DURATION;
      const velocity = element.velocity ?? DEFAULT_VELOCITY;

      events.push({
        pitch: element.pitch,
        start_time: startTime,
        duration: noteDuration,
        velocity: velocity,
      });

      duration = element.timeUntilNext ?? noteDuration;
      break;
    }

    case "chord": {
      const chordDuration = element.duration ?? DEFAULT_DURATION;

      // Add notes to events list (unchanged)
      element.notes.forEach((note) => {
        const noteDuration = note.duration ?? chordDuration;
        const velocity = note.velocity ?? element.velocity ?? DEFAULT_VELOCITY;

        events.push({
          pitch: note.pitch,
          start_time: startTime,
          duration: noteDuration,
          velocity: velocity,
        });
      });

      // NEW: Calculate maximum note duration for timing
      const maxNoteDuration = Math.max(...element.notes.map((note) => note.duration ?? chordDuration));

      // Use timeUntilNext if specified, otherwise use maximum note duration
      duration = element.timeUntilNext ?? maxNoteDuration;
      break;
    }

    case "rest": {
      // Rest implementation unchanged
      duration = element.duration ?? DEFAULT_DURATION;
      break;
    }

    case "grouping": {
      let groupTime = startTime;

      // Process group contents (unchanged)
      for (const groupElement of element.content) {
        const result = processElement(groupElement, groupTime);
        events.push(...result.events);
        groupTime += result.duration;
      }

      // CHANGED: Ignore timeUntilNext on groupings
      const naturalDuration = groupTime - startTime;
      duration = naturalDuration;
      break;
    }

    case "repetition": {
      // Repetition implementation unchanged
      let repeatTime = startTime;

      for (let i = 0; i < element.repeat; i++) {
        for (const subElement of element.content) {
          const result = processElement(subElement, repeatTime);
          events.push(...result.events);
          repeatTime += result.duration;
        }
      }

      duration = repeatTime - startTime;
      break;
    }
  }

  return { events, duration };
}

// In tone-lang.js after calling parser.parse()
function applyContainerModifiers(ast) {
  // Process each sequence (AKA voice)
  return ast.map((sequence) => {
    return applyModifiersToSequence(sequence);
  });
}

function applyModifiersToSequence(sequence, parentModifiers = {}) {
  return sequence.map((element) => {
    // Create a copy and apply parent modifiers to all element types
    let result = { ...element };

    // Apply parent modifiers to all element types
    result.velocity = result.velocity ?? parentModifiers.velocity;
    result.duration = result.duration ?? parentModifiers.duration;
    result.timeUntilNext = result.timeUntilNext ?? parentModifiers.timeUntilNext;

    switch (result.type) {
      case "chord":
        // Apply chord modifiers to notes that don't have their own
        result.notes = result.notes.map((note) => {
          return {
            ...note,
            velocity: note.velocity ?? result.velocity,
            duration: note.duration ?? result.duration,
          };
        });
        break;

      case "grouping":
        // Apply group modifiers to contained elements
        result.content = applyModifiersToSequence(result.content, {
          velocity: result.velocity,
          duration: result.duration,
          timeUntilNext: result.timeUntilNext,
        });
        break;

      case "repetition":
        // Process repetition content with parent modifiers
        result.content = result.content.map((item) => {
          if (item.type === "grouping" || item.type === "chord") {
            return applyModifiersToSequence([item], parentModifiers)[0];
          }
          return item;
        });
        break;
    }

    return result;
  });
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
    const modifiedAst = applyContainerModifiers(ast);
    return convertToneLangAstToEvents(modifiedAst);
  } catch (error) {
    if (error.name === "SyntaxError") {
      const location = error.location || {};
      const position = location.start
        ? `at position ${location.start.offset} (line ${location.start.line}, column ${location.start.column})`
        : "at unknown position";

      let helpfulMessage = `ToneLang syntax error ${position}: `;
      const invalidChar = error.found || "";

      if (/^\d+$/.test(invalidChar)) {
        helpfulMessage += `Unexpected number. Numbers must follow a modifier like 'n' for duration or 'v' for velocity.`;
      } else if (invalidChar === ".") {
        helpfulMessage += `Decimal points must be preceded by a number or a modifier (e.g., 'n0.5' or 'n.5').`;
      } else {
        helpfulMessage += `Unexpected '${invalidChar}'. Valid syntax includes note names (C-G with optional # or b), `;
        helpfulMessage += `velocity (v), duration (n), time until next (t), rests (R), or chords using [].`;
      }

      throw new Error(helpfulMessage);
    }
    throw error;
  }
}
