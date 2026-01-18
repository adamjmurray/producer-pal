/**
 * Shared type definitions for notation modules.
 *
 * @typedef {object} NoteEvent
 * @property {number} pitch - MIDI pitch
 * @property {number} start_time - Start time in beats
 * @property {number} duration - Duration in beats
 * @property {number} velocity - Velocity (0-127)
 * @property {number} [probability] - Probability (0.0-1.0)
 * @property {number} [velocity_deviation] - Velocity deviation
 */

/**
 * Note with bar copy metadata for copy/paste operations.
 *
 * @typedef {object} BarCopyNote
 * @property {number} pitch - MIDI pitch
 * @property {number} start_time - Start time in beats
 * @property {number} duration - Duration in beats
 * @property {number} velocity - Velocity (0-127)
 * @property {number} [probability] - Probability (0.0-1.0)
 * @property {number} [velocity_deviation] - Velocity deviation
 * @property {number} relativeTime - Relative time within bar
 * @property {number} originalBar - Original bar number
 */

// This file only contains typedefs - no runtime exports needed.
// TypeScript will still pick up the types via JSDoc imports.
