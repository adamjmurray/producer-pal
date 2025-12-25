import { abletonBeatsToBarBeat } from "../../../notation/barbeat/time/barbeat-time.js";

/**
 * Generate a stable cue ID from a cue point's index
 * @param {number} cueIndex - The index of the cue point in the cue_points array
 * @returns {string} Cue ID in format "cue-{index}"
 */
export function getCueId(cueIndex) {
  return `cue-${cueIndex}`;
}

/**
 * Read all cue points from the Live Set
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {Array<{id: string, name: string, time: string}>} Array of cue point objects
 */
export function readCuePoints(liveSet, timeSigNumerator, timeSigDenominator) {
  const cuePointIds = liveSet.getChildIds("cue_points");
  const cuePoints = [];

  for (let i = 0; i < cuePointIds.length; i++) {
    const cue = new LiveAPI(cuePointIds[i]);
    const name = cue.getProperty("name");
    const timeInBeats = cue.getProperty("time");
    const timeFormatted = abletonBeatsToBarBeat(
      timeInBeats,
      timeSigNumerator,
      timeSigDenominator,
    );

    cuePoints.push({
      id: getCueId(i),
      name,
      time: timeFormatted,
    });
  }

  return cuePoints;
}

/**
 * Find a cue by ID or time position
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Search options
 * @param {string} [options.cueId] - Cue ID to find (e.g., "cue-0")
 * @param {number} [options.timeInBeats] - Exact time position in beats
 * @returns {{cue: LiveAPI, index: number} | null} Cue object and index, or null if not found
 */
export function findCue(liveSet, { cueId, timeInBeats }) {
  const cuePointIds = liveSet.getChildIds("cue_points");

  for (let i = 0; i < cuePointIds.length; i++) {
    const cue = new LiveAPI(cuePointIds[i]);

    if (cueId != null && getCueId(i) === cueId) {
      return { cue, index: i };
    }

    if (timeInBeats != null) {
      const cueTime = cue.getProperty("time");

      if (Math.abs(cueTime - timeInBeats) < 0.001) {
        return { cue, index: i };
      }
    }
  }

  return null;
}

/**
 * Find all cues matching a name
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {string} cueName - Name to match
 * @returns {Array<{cue: LiveAPI, index: number, time: number}>} Array of matching cues with their times
 */
export function findCuesByName(liveSet, cueName) {
  const cuePointIds = liveSet.getChildIds("cue_points");
  const matches = [];

  for (let i = 0; i < cuePointIds.length; i++) {
    const cue = new LiveAPI(cuePointIds[i]);
    const name = cue.getProperty("name");

    if (name === cueName) {
      const time = cue.getProperty("time");

      matches.push({ cue, index: i, time });
    }
  }

  return matches;
}
