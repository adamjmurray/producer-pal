import { formatNotation as barbeatFormatNotation } from "./barbeat/barbeat-format-notation.js";
import { interpretNotation as barbeatInterpretNotation } from "./barbeat/barbeat-interpreter.js";
import { interpretNotation as starkInterpretNotation } from "./stark/stark-interpreter.js";

/**
 * Interpret notation string into MIDI notes
 * Routes to appropriate notation system based on context
 * @param {string} notationString - Notation string
 * @param {Object} options - Options including context
 * @param {Object} [options.context] - Context object with smallModelMode flag
 * @returns {Array} Array of MIDI note objects
 */
export function interpretNotation(notationString, options = {}) {
  const { context, ...otherOptions } = options;

  if (context?.smallModelMode) {
    // Use Stark notation for small model mode
    return starkInterpretNotation(notationString, otherOptions);
  } else {
    // Use barbeat notation for standard mode
    return barbeatInterpretNotation(notationString, otherOptions);
  }
}

/**
 * Format MIDI notes into notation string
 * Currently only supports barbeat notation
 * @param {Array} clipNotes - Array of MIDI note objects
 * @param {Object} options - Options including context
 * @param {Object} [options.context] - Context object with smallModelMode flag
 * @returns {string} Notation string
 */
export function formatNotation(clipNotes, options = {}) {
  const { context, ...otherOptions } = options;

  // TODO: Implement Stark formatter for small model mode
  // For now, always use barbeat formatter
  return barbeatFormatNotation(clipNotes, otherOptions);
}
