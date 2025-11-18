import { formatNotation } from "../../notation/barbeat/barbeat-format-notation.js";
import {
  abletonBeatsToBarBeat,
  abletonBeatsToBarBeatDuration,
} from "../../notation/barbeat/barbeat-time.js";
import {
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_PRO,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_TONES,
  WARP_MODE,
} from "../constants.js";
import { liveGainToDb } from "../shared/gain-utils.js";
import { validateIdType } from "../shared/id-validation.js";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "../shared/include-params.js";

/**
 * Read a MIDI or audio clip from Ableton Live
 * @param {Object} args - Arguments for the function
 * @param {number} [args.trackIndex] - Track index (0-based)
 * @param {number} [args.sceneIndex] - Clip slot index (0-based)
 * @param {string} [args.clipId] - Clip ID to directly access any clip
 * @param {string[]} [args.include] - Array of data to include in response
 * @param {boolean} [args.includeClipNotes] - Whether to include notes data (legacy parameter)
 * @returns {Object} Result object with clip information
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
    clip = new LiveAPI(
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

  const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;
  const timeSigNumerator = clip.getProperty("signature_numerator");
  const timeSigDenominator = clip.getProperty("signature_denominator");

  const isLooping = clip.getProperty("looping") > 0;
  const lengthBeats = clip.getProperty("length"); // Live API already gives us the effective length!

  const clipName = clip.getProperty("name");

  // Read boundary properties from Live
  const startMarkerBeats = clip.getProperty("start_marker");
  const loopStartBeats = clip.getProperty("loop_start");
  const loopEndBeats = clip.getProperty("loop_end");
  const endMarkerBeats = clip.getProperty("end_marker");

  // Calculate start based on looping state
  let startBeats;
  if (isLooping) {
    startBeats = loopStartBeats;
  } else {
    startBeats = startMarkerBeats;
  }

  // Calculate end based on looping state
  let endBeats;
  if (isLooping) {
    endBeats = loopEndBeats;
  } else {
    endBeats = endMarkerBeats;
  }

  // Sanity check for non-looping clips
  if (!isLooping) {
    const derivedStart = endBeats - lengthBeats;
    if (Math.abs(derivedStart - startBeats) > 0.001) {
      console.error(
        `Warning: Derived start (${derivedStart}) differs from start_marker (${startBeats})`,
      );
    }
  }

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

  // Only include these boolean properties when true
  const playing = clip.getProperty("is_playing") > 0;
  if (playing) {
    result.playing = true;
  }

  const triggered = clip.getProperty("is_triggered") > 0;
  if (triggered) {
    result.triggered = true;
  }

  const recording = clip.getProperty("is_recording") > 0;
  if (recording) {
    result.recording = true;
  }

  const overdubbing = clip.getProperty("is_overdubbing") > 0;
  if (overdubbing) {
    result.overdubbing = true;
  }

  const muted = clip.getProperty("muted") > 0;
  if (muted) {
    result.muted = true;
  }

  if (isArrangementClip) {
    const liveSet = new LiveAPI("live_set");
    const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    const songTimeSigDenominator = liveSet.getProperty("signature_denominator");
    result.trackIndex = clip.trackIndex;
    const startTimeBeats = clip.getProperty("start_time");
    const endTimeBeats = clip.getProperty("end_time");
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

  if (result.type === "midi") {
    // Use the Live API's length property directly
    const notesDictionary = clip.call(
      "get_notes_extended",
      0,
      128,
      0,
      lengthBeats,
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

  if (result.type === "audio") {
    const liveGain = clip.getProperty("gain");
    result.gainDb = liveGainToDb(liveGain);
    // Uncomment for validating our gainDb conversion against Live's display:
    // result.gainDisplay = clip.getProperty("gain_display_string");

    const filePath = clip.getProperty("file_path");
    if (filePath) {
      // Extract just filename, handle both Unix and Windows paths
      result.filename = filePath.split(/[/\\]/).pop();
    }

    const pitchCoarse = clip.getProperty("pitch_coarse");
    const pitchFine = clip.getProperty("pitch_fine");
    result.pitchShift = pitchCoarse + pitchFine / 100;

    result.sampleLength = clip.getProperty("sample_length");
    result.sampleRate = clip.getProperty("sample_rate");

    // Warping state
    result.warping = clip.getProperty("warping") > 0;
    const warpModeValue = clip.getProperty("warp_mode");
    result.warpMode =
      {
        [LIVE_API_WARP_MODE_BEATS]: WARP_MODE.BEATS,
        [LIVE_API_WARP_MODE_TONES]: WARP_MODE.TONES,
        [LIVE_API_WARP_MODE_TEXTURE]: WARP_MODE.TEXTURE,
        [LIVE_API_WARP_MODE_REPITCH]: WARP_MODE.REPITCH,
        [LIVE_API_WARP_MODE_COMPLEX]: WARP_MODE.COMPLEX,
        [LIVE_API_WARP_MODE_REX]: WARP_MODE.REX,
        [LIVE_API_WARP_MODE_PRO]: WARP_MODE.PRO,
      }[warpModeValue] ?? "unknown";
  }

  // Add warp markers array for audio clips when requested
  if (result.type === "audio" && includeWarpMarkers) {
    try {
      const warpMarkersJson = clip.getProperty("warp_markers");
      if (warpMarkersJson && warpMarkersJson !== "") {
        const warpMarkersData = JSON.parse(warpMarkersJson);
        // Handle both possible structures: direct array or nested in warp_markers property
        // Transform snake_case properties to camelCase for consistency with update-clip
        if (Array.isArray(warpMarkersData)) {
          result.warpMarkers = warpMarkersData.map((marker) => ({
            sampleTime: marker.sample_time,
            beatTime: marker.beat_time,
          }));
        } else if (
          warpMarkersData.warp_markers &&
          Array.isArray(warpMarkersData.warp_markers)
        ) {
          result.warpMarkers = warpMarkersData.warp_markers.map((marker) => ({
            sampleTime: marker.sample_time,
            beatTime: marker.beat_time,
          }));
        }
      }
    } catch (error) {
      // Fail gracefully - clip might not support warp markers or format might be unexpected
      console.error(
        `Failed to read warp markers for clip ${clip.id}: ${error.message}`,
      );
    }
  }

  return result;
}
