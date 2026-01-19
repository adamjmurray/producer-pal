import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.js";
import {
  abletonBeatsToBarBeat,
  abletonBeatsToBarBeatDuration,
} from "#src/notation/barbeat/time/barbeat-time.js";
import { errorMessage } from "#src/shared/error-utils.js";
import * as console from "#src/shared/v8-max-console.js";
import {
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_PRO,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_TONES,
  WARP_MODE,
} from "#src/tools/constants.js";
import { liveGainToDb } from "#src/tools/shared/gain-utils.js";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.js";
import { validateIdType } from "#src/tools/shared/validation/id-validation.js";

/**
 * Read a MIDI or audio clip from Ableton Live
 * @param {object} args - Arguments for the function
 * @param {number | null} [args.trackIndex] - Track index (0-based)
 * @param {number | null} [args.sceneIndex] - Clip slot index (0-based)
 * @param {string | null} [args.clipId] - Clip ID to directly access any clip
 * @param {string[]} [args.include] - Array of data to include in response
 * @param {boolean} [args.includeClipNotes] - Whether to include notes data (legacy parameter)
 * @param {object} _context - Context object (unused)
 * @returns {object} Result object with clip information
 */
export function readClip(args = {}, _context = {}) {
  const { trackIndex = null, sceneIndex = null, clipId = null } = args;

  const { includeClipNotes, includeColor, includeWarpMarkers } =
    parseIncludeArray(args.include, READ_CLIP_DEFAULTS);

  if (clipId === null && (trackIndex === null || sceneIndex === null)) {
    throw new Error(
      "Either clipId or both trackIndex and sceneIndex must be provided",
    );
  }

  // Support "id {id}" (such as returned by childIds()) and id values directly
  let clip;

  if (clipId != null) {
    // Validate the clip ID is actually a clip
    clip = validateIdType(clipId, "clip", "readClip");
  } else {
    clip = LiveAPI.from(
      `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
    );

    if (!clip.exists()) {
      return {
        id: null,
        type: null,
        name: null,
        trackIndex,
        sceneIndex,
      };
    }
  }

  const isArrangementClip =
    /** @type {number} */ (clip.getProperty("is_arrangement_clip")) > 0;
  const timeSigNumerator = /** @type {number} */ (
    clip.getProperty("signature_numerator")
  );
  const timeSigDenominator = /** @type {number} */ (
    clip.getProperty("signature_denominator")
  );

  const isLooping = /** @type {number} */ (clip.getProperty("looping")) > 0;
  const lengthBeats = /** @type {number} */ (clip.getProperty("length")); // Live API already gives us the effective length!

  const clipName = /** @type {string} */ (clip.getProperty("name"));

  // Read boundary properties from Live
  const startMarkerBeats = /** @type {number} */ (
    clip.getProperty("start_marker")
  );
  const loopStartBeats = /** @type {number} */ (clip.getProperty("loop_start"));
  const loopEndBeats = /** @type {number} */ (clip.getProperty("loop_end"));
  const endMarkerBeats = /** @type {number} */ (clip.getProperty("end_marker"));

  // Calculate start and end based on looping state
  const { startBeats, endBeats } = getActiveClipBounds(
    isLooping,
    startMarkerBeats,
    loopStartBeats,
    endMarkerBeats,
    loopEndBeats,
    lengthBeats,
  );

  // Convert to bar|beat notation
  const start = abletonBeatsToBarBeat(
    startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  const end = abletonBeatsToBarBeat(
    endBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  const length = abletonBeatsToBarBeatDuration(
    endBeats - startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Check if firstStart differs from start
  const firstStart =
    Math.abs(startMarkerBeats - startBeats) > 0.001
      ? abletonBeatsToBarBeat(
          startMarkerBeats,
          timeSigNumerator,
          timeSigDenominator,
        )
      : null;

  const result = {
    id: clip.id,
    type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
    ...(clipName && { name: clipName }),
    view: isArrangementClip ? "arrangement" : "session",
    ...(includeColor && { color: clip.getColor() }),
    timeSignature: clip.timeSignature,
    looping: isLooping,
    start: start,
    end: end,
    length: length,
    ...(firstStart != null && { firstStart }),
  };

  // Add boolean state properties
  addBooleanStateProperties(result, clip);

  // Add location properties
  addClipLocationProperties(result, clip, isArrangementClip);

  // Process MIDI clip properties
  if (result.type === "midi") {
    processMidiClip(
      result,
      clip,
      includeClipNotes,
      lengthBeats,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Process audio clip properties
  if (result.type === "audio") {
    processAudioClip(result, clip, includeWarpMarkers);
  }

  return result;
}

/**
 * @typedef {object} WarpMarker
 * @property {number} sampleTime - Sample time position
 * @property {number} beatTime - Beat time position
 */

/**
 * @typedef {object} WarpMarkerData
 * @property {number} sample_time - Sample time position
 * @property {number} beat_time - Beat time position
 */

/**
 * Process warp markers for an audio clip
 * @param {LiveAPI} clip - LiveAPI clip object
 * @returns {Array<WarpMarker>|undefined} - Array of warp markers or undefined
 */
function processWarpMarkers(clip) {
  try {
    const warpMarkersJson = /** @type {string} */ (
      clip.getProperty("warp_markers")
    );

    if (!warpMarkersJson || warpMarkersJson === "") {
      return;
    }

    const warpMarkersData = JSON.parse(warpMarkersJson);
    /**
     * @param {WarpMarkerData} marker - Raw warp marker data
     * @returns {WarpMarker} Formatted warp marker
     */
    const mapMarker = (marker) => ({
      sampleTime: marker.sample_time,
      beatTime: marker.beat_time,
    });

    // Handle both possible structures: direct array or nested in warp_markers property
    if (Array.isArray(warpMarkersData)) {
      return warpMarkersData.map(mapMarker);
    }

    if (
      warpMarkersData.warp_markers &&
      Array.isArray(warpMarkersData.warp_markers)
    ) {
      return warpMarkersData.warp_markers.map(mapMarker);
    }
  } catch (error) {
    // Fail gracefully - clip might not support warp markers or format might be unexpected
    console.error(
      `Failed to read warp markers for clip ${clip.id}: ${errorMessage(error)}`,
    );
  }
}

/**
 * Add boolean state properties (playing, triggered, recording, overdubbing, muted)
 * Only includes properties that are true
 * @param {Record<string, unknown>} result - Result object to add properties to
 * @param {LiveAPI} clip - LiveAPI clip object
 */
function addBooleanStateProperties(result, clip) {
  if (/** @type {number} */ (clip.getProperty("is_playing")) > 0) {
    result.playing = true;
  }

  if (/** @type {number} */ (clip.getProperty("is_triggered")) > 0) {
    result.triggered = true;
  }

  if (/** @type {number} */ (clip.getProperty("is_recording")) > 0) {
    result.recording = true;
  }

  if (/** @type {number} */ (clip.getProperty("is_overdubbing")) > 0) {
    result.overdubbing = true;
  }

  if (/** @type {number} */ (clip.getProperty("muted")) > 0) {
    result.muted = true;
  }
}

/**
 * Process MIDI clip specific properties
 * @param {Record<string, unknown>} result - Result object to add properties to
 * @param {LiveAPI} clip - LiveAPI clip object
 * @param {boolean} includeClipNotes - Whether to include formatted notes
 * @param {number} lengthBeats - Clip length in beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 */
function processMidiClip(
  result,
  clip,
  includeClipNotes,
  lengthBeats,
  timeSigNumerator,
  timeSigDenominator,
) {
  const notesDictionary = /** @type {string} */ (
    clip.call("get_notes_extended", 0, 128, 0, lengthBeats)
  );
  const notes = JSON.parse(notesDictionary).notes;

  result.noteCount = notes.length;

  if (includeClipNotes) {
    result.notes = formatNotation(notes, {
      timeSigNumerator,
      timeSigDenominator,
    });
  }
}

/** Mapping of Live API warp modes to friendly names */
const WARP_MODE_MAPPING = {
  [LIVE_API_WARP_MODE_BEATS]: WARP_MODE.BEATS,
  [LIVE_API_WARP_MODE_TONES]: WARP_MODE.TONES,
  [LIVE_API_WARP_MODE_TEXTURE]: WARP_MODE.TEXTURE,
  [LIVE_API_WARP_MODE_REPITCH]: WARP_MODE.REPITCH,
  [LIVE_API_WARP_MODE_COMPLEX]: WARP_MODE.COMPLEX,
  [LIVE_API_WARP_MODE_REX]: WARP_MODE.REX,
  [LIVE_API_WARP_MODE_PRO]: WARP_MODE.PRO,
};

/**
 * Process audio clip specific properties
 * @param {Record<string, unknown>} result - Result object to add properties to
 * @param {LiveAPI} clip - LiveAPI clip object
 * @param {boolean} includeWarpMarkers - Whether to include warp markers
 */
function processAudioClip(result, clip, includeWarpMarkers) {
  const liveGain = /** @type {number} */ (clip.getProperty("gain"));

  result.gainDb = liveGainToDb(liveGain);

  const filePath = /** @type {string | null} */ (clip.getProperty("file_path"));

  if (filePath) {
    result.sampleFile = filePath;
  }

  const pitchCoarse = /** @type {number} */ (clip.getProperty("pitch_coarse"));
  const pitchFine = /** @type {number} */ (clip.getProperty("pitch_fine"));

  result.pitchShift = pitchCoarse + pitchFine / 100;

  result.sampleLength = /** @type {number} */ (
    clip.getProperty("sample_length")
  );
  result.sampleRate = /** @type {number} */ (clip.getProperty("sample_rate"));

  // Warping state
  result.warping = /** @type {number} */ (clip.getProperty("warping")) > 0;
  const warpModeValue = /** @type {keyof typeof WARP_MODE_MAPPING} */ (
    clip.getProperty("warp_mode")
  );

  result.warpMode = WARP_MODE_MAPPING[warpModeValue] ?? "unknown";

  // Add warp markers array when requested
  if (includeWarpMarkers) {
    const warpMarkers = processWarpMarkers(clip);

    if (warpMarkers !== undefined) {
      result.warpMarkers = warpMarkers;
    }
  }
}

/**
 * Add clip location properties (trackIndex, sceneIndex, or arrangement properties)
 * @param {Record<string, unknown>} result - Result object to add properties to
 * @param {LiveAPI} clip - LiveAPI clip object
 * @param {boolean} isArrangementClip - Whether clip is in arrangement view
 */
function addClipLocationProperties(result, clip, isArrangementClip) {
  if (isArrangementClip) {
    const liveSet = LiveAPI.from("live_set");
    const songTimeSigNumerator = /** @type {number} */ (
      liveSet.getProperty("signature_numerator")
    );
    const songTimeSigDenominator = /** @type {number} */ (
      liveSet.getProperty("signature_denominator")
    );

    result.trackIndex = clip.trackIndex;
    const startTimeBeats = /** @type {number} */ (
      clip.getProperty("start_time")
    );
    const endTimeBeats = /** @type {number} */ (clip.getProperty("end_time"));

    result.arrangementStart = abletonBeatsToBarBeat(
      startTimeBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
    result.arrangementLength = abletonBeatsToBarBeatDuration(
      endTimeBeats - startTimeBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  } else {
    result.trackIndex = clip.trackIndex;
    result.sceneIndex = clip.sceneIndex;
  }
}

/**
 * Get the active start and end beats based on looping state
 * @param {boolean} isLooping - Whether the clip is looping
 * @param {number} startMarkerBeats - Start marker position in beats
 * @param {number} loopStartBeats - Loop start position in beats
 * @param {number} endMarkerBeats - End marker position in beats
 * @param {number} loopEndBeats - Loop end position in beats
 * @param {number} lengthBeats - Clip length in beats
 * @returns {{startBeats: number, endBeats: number}} - Object with startBeats and endBeats
 */
function getActiveClipBounds(
  isLooping,
  startMarkerBeats,
  loopStartBeats,
  endMarkerBeats,
  loopEndBeats,
  lengthBeats,
) {
  const startBeats = isLooping ? loopStartBeats : startMarkerBeats;
  const endBeats = isLooping ? loopEndBeats : endMarkerBeats;

  // Sanity check for non-looping clips
  if (!isLooping) {
    const derivedStart = endBeats - lengthBeats;

    if (Math.abs(derivedStart - startBeats) > 0.001) {
      console.error(
        `Warning: Derived start (${derivedStart}) differs from start_marker (${startBeats})`,
      );
    }
  }

  return { startBeats, endBeats };
}
