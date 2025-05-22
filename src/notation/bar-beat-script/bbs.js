// src/notation/bar-beat-script/bbs.js
import { midiPitchToName } from "../midi-pitch-to-name";
import * as parser from "./bbs-parser";

export { BAR_BEAT_SCRIPT_DESCRIPTION as notationDescription } from "./bbs-description";

const DEFAULT_VELOCITY = 70;
const DEFAULT_DURATION = 1.0;
const DEFAULT_TIME_SIGNATURE = 4; // 4/4 time

/**
 * Convert bar.beat.unit to absolute beat time
 * @param {Object} barBeatUnit - {bar, beat, unit}
 * @param {number} timeSignature - Beats per bar (default 4)
 * @returns {number} Absolute beat time
 */
function barBeatUnitToBeats(barBeatUnit, timeSignature = DEFAULT_TIME_SIGNATURE) {
  const { bar, beat, unit = 0 } = barBeatUnit;

  // Convert to 0-based for calculation
  const absoluteBeats = (bar - 1) * timeSignature + (beat - 1);

  // Add fractional beat from units (assuming 480 PPQN)
  return absoluteBeats + unit / 480;
}

/**
 * Convert absolute beat time to bar.beat.unit
 * @param {number} beatTime - Absolute beat time
 * @param {number} timeSignature - Beats per bar (default 4)
 * @returns {Object} {bar, beat, unit}
 */
function beatsToBarBeatUnit(beatTime, timeSignature = DEFAULT_TIME_SIGNATURE) {
  const totalBeats = Math.floor(beatTime);
  const fractionalBeat = beatTime - totalBeats;

  const bar = Math.floor(totalBeats / timeSignature) + 1;
  const beat = (totalBeats % timeSignature) + 1;
  const unit = Math.round(fractionalBeat * 480);

  return { bar, beat, unit };
}

/**
 * Parse BarBeatScript string to note events
 * @param {string} bbsExpression - BarBeatScript string
 * @param {Object} options - Parse options
 * @param {number} options.timeSignature - Beats per bar (default 4)
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
export function parseNotation(bbsExpression, options = {}) {
  if (!bbsExpression) return [];

  const { timeSignature = DEFAULT_TIME_SIGNATURE } = options;

  try {
    const ast = parser.parse(bbsExpression);

    return ast.map((noteEvent) => ({
      pitch: noteEvent.pitch,
      start_time: barBeatUnitToBeats(noteEvent.start, timeSignature),
      duration: noteEvent.duration ?? DEFAULT_DURATION,
      velocity: noteEvent.velocity ?? DEFAULT_VELOCITY,
    }));
  } catch (error) {
    if (error.name === "SyntaxError") {
      const location = error.location || {};
      const position = location.start
        ? `at position ${location.start.offset} (line ${location.start.line}, column ${location.start.column})`
        : "at unknown position";

      throw new Error(`BarBeatScript syntax error ${position}: ${error.message}`);
    }
    throw error;
  }
}

// /**
//  * Format note to BarBeatScript syntax
//  * @param {Object} note - Note object from Live API
//  * @param {number} timeSignature - Beats per bar
//  * @returns {string} BarBeatScript representation
//  */
// function formatNote(note, timeSignature) {
//   const noteName = midiPitchToName(note.pitch);
//   const barBeatUnit = beatsToBarBeatUnit(note.start_time, timeSignature);

//   let startTime = `${barBeatUnit.bar}.${barBeatUnit.beat}`;
//   if (barBeatUnit.unit > 0) {
//     startTime += `.${barBeatUnit.unit}`;
//   }

//   let result = `${startTime}:${noteName}`;

//   if (note.velocity !== DEFAULT_VELOCITY) {
//     result += `v${Math.round(note.velocity)}`;
//   }

//   if (note.duration !== DEFAULT_DURATION) {
//     result += `t${note.duration}`;
//   }

//   return result;
// }

/**
 * Format MIDI notes to BarBeatScript string
 * @param {Array} notes - Array of MIDI note objects
 * @param {Object} options - Formatting options
 * @param {number} options.timeSignature - Beats per bar (default 4)
 * @returns {string} BarBeatScript representation
 */
export function formatNotation(notes, options = {}) {
  if (!notes || notes.length === 0) return "";

  const { timeSignature = DEFAULT_TIME_SIGNATURE } = options;

  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.start_time - b.start_time);

  // Group notes by start time for simultaneous events
  const timeGroups = {};
  for (const note of sortedNotes) {
    const timeKey = note.start_time.toFixed(6); // Use precision to avoid floating point issues
    if (!timeGroups[timeKey]) {
      timeGroups[timeKey] = [];
    }
    timeGroups[timeKey].push(note);
  }

  const events = [];

  for (const [startTime, groupNotes] of Object.entries(timeGroups)) {
    const time = parseFloat(startTime);
    const barBeatUnit = beatsToBarBeatUnit(time, timeSignature);

    let startTimeStr = `${barBeatUnit.bar}.${barBeatUnit.beat}`;
    if (barBeatUnit.unit > 0) {
      startTimeStr += `.${barBeatUnit.unit}`;
    }

    const noteStrs = groupNotes.map((note) => {
      const noteName = midiPitchToName(note.pitch);
      let noteStr = noteName;

      if (note.velocity !== DEFAULT_VELOCITY) {
        noteStr += `v${Math.round(note.velocity)}`;
      }

      if (note.duration !== DEFAULT_DURATION) {
        noteStr += `t${note.duration}`;
      }

      return noteStr;
    });

    events.push(`${startTimeStr}:${noteStrs.join(" ")}`);
  }

  return events.join(", ");
}
