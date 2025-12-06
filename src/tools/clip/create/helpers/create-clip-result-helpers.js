import { abletonBeatsToBarBeatDuration } from "#src/notation/barbeat/time/barbeat-time.js";

/**
 * Builds the properties object to set on a clip
 * @param {number} startBeats - Loop start position in beats
 * @param {number} endBeats - Loop end position in beats
 * @param {number} firstStartBeats - First playback start position in beats
 * @param {boolean} looping - Whether the clip is looping
 * @param {string} clipName - Clip name
 * @param {string} color - Clip color in hex format
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {number} clipLength - Default clip length in beats (used when endBeats not specified)
 * @returns {object} - Clip properties to set
 */
export function buildClipProperties(
  startBeats,
  endBeats,
  firstStartBeats,
  looping,
  clipName,
  color,
  timeSigNumerator,
  timeSigDenominator,
  clipLength,
) {
  const propsToSet = {};

  // Set start_marker and loop_start
  propsToSet.start_marker = startBeats ?? 0;
  propsToSet.loop_start = startBeats ?? 0;

  // Set loop_end and end_marker
  // Use clipLength as default when endBeats not specified
  // Note: loop_end must be > loop_start (Live API constraint)
  const effectiveEnd = endBeats ?? clipLength;

  propsToSet.loop_end = effectiveEnd;
  propsToSet.end_marker = effectiveEnd;

  // Set playing_position (firstStart) only for looping clips
  if (looping && firstStartBeats != null) {
    propsToSet.playing_position = firstStartBeats;
  }

  // Optional properties
  if (clipName) {
    propsToSet.name = clipName;
  }

  if (color != null) {
    propsToSet.color = color;
  }

  if (looping != null) {
    propsToSet.looping = looping ? 1 : 0;
  }

  if (timeSigNumerator != null && timeSigDenominator != null) {
    propsToSet.signature_numerator = timeSigNumerator;
    propsToSet.signature_denominator = timeSigDenominator;
  }

  return propsToSet;
}

/**
 * Builds the result object for a created clip
 * @param {object} clip - LiveAPI clip object
 * @param {number} trackIndex - Track index
 * @param {string} view - View type (session or arrangement)
 * @param {number} sceneIndex - Scene index for session clips
 * @param {string} arrangementStart - Arrangement start in bar|beat format (explicit position)
 * @param {string} notationString - Original notation string
 * @param {Array} notes - Array of MIDI notes
 * @param {string} length - Original length parameter
 * @param {number} timeSigNumerator - Clip time signature numerator
 * @param {number} timeSigDenominator - Clip time signature denominator
 * @param {string} sampleFile - Audio file path (for audio clips)
 * @returns {object} - Clip result object
 */
export function buildClipResult(
  clip,
  trackIndex,
  view,
  sceneIndex,
  arrangementStart,
  notationString,
  notes,
  length,
  timeSigNumerator,
  timeSigDenominator,
  sampleFile,
) {
  const clipResult = {
    id: clip.id,
    trackIndex,
  };

  // Add view-specific properties
  if (view === "session") {
    clipResult.sceneIndex = sceneIndex;
  } else {
    clipResult.arrangementStart = arrangementStart;
  }

  // For MIDI clips: include noteCount if notes were provided
  if (notationString != null) {
    clipResult.noteCount = notes.length;

    // Include calculated length if it wasn't provided as input parameter
    if (length == null) {
      const actualClipLength = clip.getProperty("length");

      clipResult.length = abletonBeatsToBarBeatDuration(
        actualClipLength,
        timeSigNumerator,
        timeSigDenominator,
      );
    }
  }

  // For audio clips: include actual clip length from Live API
  if (sampleFile) {
    const actualClipLength = clip.getProperty("length");

    clipResult.length = abletonBeatsToBarBeatDuration(
      actualClipLength,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return clipResult;
}
