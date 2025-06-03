// src/notation/barbeat/barbeat-time.js

/**
 * TODO: rename the non-duration-based functions in here (i.e. not the last two) to clearly indicate we are handling bar|beat positions
 * Convert beats to bar|beat format
 * @param {number} beats - Absolute beats (0-based)
 * @param {number} beatsPerBar - Beats per bar from time signature
 * @returns {string} bar|beat format (e.g., "2|3.5")
 */
export function beatsToBarBeat(beats, beatsPerBar) {
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = (beats % beatsPerBar) + 1;

  // Format beat - avoid unnecessary decimals

  const beatFormatted = beat % 1 === 0 ? beat.toString() : beat.toFixed(3).replace(/\.?0+$/, "");
  return `${bar}|${beatFormatted}`;
}

/**
 * Convert bar|beat format to beats
 * @param {string} barBeat - bar|beat format (e.g., "2|3.5")
 * @param {number} beatsPerBar - Beats per bar from time signature
 * @returns {number} Absolute beats (0-based)
 */
export function barBeatToBeats(barBeat, beatsPerBar) {
  const match = barBeat.match(/^(-?\d+)\|(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error(`Invalid bar|beat format: "${barBeat}". Expected "{int}|{float}" like "1|2" or "2|3.5"`);
  }
  const bar = Number.parseInt(match[1]);
  const beat = Number.parseFloat(match[2]);

  if (bar < 1) throw new Error(`Bar number must be 1 or greater, got: ${bar}`);
  if (beat < 1) throw new Error(`Beat must be 1 or greater, got: ${beat}`);

  return (bar - 1) * beatsPerBar + (beat - 1);
}

/**
 * Convert time signature to Ableton beats (quarter notes) per bar
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Ableton beats (quarter notes) per bar
 */
export function timeSigToAbletonBeatsPerBar(timeSigNumerator, timeSigDenominator) {
  return (timeSigNumerator * 4) / timeSigDenominator;
}

/**
 * Convert Ableton beats (quarter notes) to bar|beat format using musical beats
 * @param {number} abletonBeats - Quarter note beats (0-based)
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {string} bar|beat format (e.g., "2|3.5")
 */
export function abletonBeatsToBarBeat(abletonBeats, timeSigNumerator, timeSigDenominator) {
  const musicalBeatsPerBar = timeSigNumerator;
  const musicalBeats = abletonBeats * (timeSigDenominator / 4);
  return beatsToBarBeat(musicalBeats, musicalBeatsPerBar);
}

/**
 * Convert bar|beat format to Ableton beats (quarter notes) using musical beats
 * @param {string|null} barBeat - bar|beat format (e.g., "2|3.5") or null
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number|null} Quarter note beats (0-based) or null if barBeat is null
 */
export function barBeatToAbletonBeats(barBeat, timeSigNumerator, timeSigDenominator) {
  if (barBeat == null) {
    return null;
  }
  const musicalBeatsPerBar = timeSigNumerator;
  const musicalBeats = barBeatToBeats(barBeat, musicalBeatsPerBar);
  return musicalBeats * (4 / timeSigDenominator);
}

/**
 * Convert Ableton beats (quarter notes) to bar:beat duration format using musical beats
 * @param {number} abletonBeats - Quarter note beats (duration, not position)
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {string} bar:beat duration format (e.g., "2:1.5" = 2 bars + 1.5 beats)
 */
export function abletonBeatsToBarBeatDuration(abletonBeats, timeSigNumerator, timeSigDenominator) {
  if (abletonBeats < 0) {
    throw new Error(`Duration cannot be negative, got: ${abletonBeats}`);
  }

  // Convert Ableton beats to musical beats
  const musicalBeats = abletonBeats * (timeSigDenominator / 4);
  const musicalBeatsPerBar = timeSigNumerator;

  // Calculate bars and remaining beats (0-based for duration)
  const bars = Math.floor(musicalBeats / musicalBeatsPerBar);
  const remainingBeats = musicalBeats % musicalBeatsPerBar;

  // Format remaining beats - avoid unnecessary decimals
  const beatsFormatted =
    remainingBeats % 1 === 0 ? remainingBeats.toString() : remainingBeats.toFixed(3).replace(/\.?0+$/, "");

  return `${bars}:${beatsFormatted}`;
}

/**
 * Convert bar:beat duration format to Ableton beats (quarter notes) using musical beats
 * @param {string} barBeatDuration - bar:beat duration format (e.g., "2:1.5")
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Quarter note beats (duration)
 */
export function barBeatDurationToAbletonBeats(barBeatDuration, timeSigNumerator, timeSigDenominator) {
  const match = barBeatDuration.match(/^(-?\d+):(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error(
      `Invalid bar:beat duration format: "${barBeatDuration}". Expected "{int}:{float}" like "1:2" or "2:1.5"`,
    );
  }

  const bars = Number.parseInt(match[1]);
  const beats = Number.parseFloat(match[2]);

  if (bars < 0) throw new Error(`Bars in duration must be 0 or greater, got: ${bars}`);
  if (beats < 0) throw new Error(`Beats in duration must be 0 or greater, got: ${beats}`);

  const musicalBeatsPerBar = timeSigNumerator;

  // Calculate total musical beats (0-based duration)
  const totalMusicalBeats = bars * musicalBeatsPerBar + beats;

  // Convert musical beats to Ableton beats
  return totalMusicalBeats * (4 / timeSigDenominator);
}
