import {
  abletonBeatsToBarBeat,
  abletonBeatsToBarBeatDuration,
} from "../../notation/barbeat/barbeat-time.js";
import { formatNotation } from "../../notation/notation.js";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "../shared/include-params.js";

/**
 * Read a MIDI clip from Ableton Live and return its notes as a notation string
 * @param {Object} args - Arguments for the function
 * @param {number} [args.trackIndex] - Track index (0-based)
 * @param {number} [args.sceneIndex] - Clip slot index (0-based)
 * @param {string} [args.clipId] - Clip ID to directly access any clip
 * @param {string[]} [args.include] - Array of data to include in response
 * @param {boolean} [args.includeClipNotes] - Whether to include notes data (legacy parameter)
 * @returns {Object} Result object with clip information
 */
export function readClip(args = {}) {
  const { trackIndex = null, sceneIndex = null, clipId = null } = args;

  const { includeClipNotes, includeColor } = parseIncludeArray(
    args.include,
    READ_CLIP_DEFAULTS,
  );
  if (clipId === null && (trackIndex === null || sceneIndex === null)) {
    throw new Error(
      "Either clipId or both trackIndex and sceneIndex must be provided",
    );
  }

  // Support "id {id}" (such as returned by childIds()) and id values directly
  // TODO: Need test coverage of this logic
  const clip =
    clipId != null
      ? LiveAPI.from(clipId)
      : new LiveAPI(
          `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
        );

  if (!clip.exists()) {
    if (clipId != null)
      throw new Error(`No clip exists for clipId "${clipId}"`);
    return {
      id: null,
      type: null,
      name: null,
      trackIndex,
      sceneIndex,
    };
  }

  const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;
  const timeSigNumerator = clip.getProperty("signature_numerator");
  const timeSigDenominator = clip.getProperty("signature_denominator");

  const isLooping = clip.getProperty("looping") > 0;
  const lengthBeats = clip.getProperty("length"); // Live API already gives us the effective length!

  const clipName = clip.getProperty("name");
  const startMarker = abletonBeatsToBarBeat(
    clip.getProperty("start_marker"),
    timeSigNumerator,
    timeSigDenominator,
  );
  const loopStart = abletonBeatsToBarBeat(
    clip.getProperty("loop_start"),
    timeSigNumerator,
    timeSigDenominator,
  );

  const result = {
    id: clip.id,
    type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
    ...(clipName && { name: clipName }),
    view: isArrangementClip ? "arrangement" : "session",
    ...(includeColor && { color: clip.getColor() }),
    loop: isLooping,
    length: abletonBeatsToBarBeatDuration(
      lengthBeats,
      timeSigNumerator,
      timeSigDenominator,
    ),
    ...(startMarker !== "1|1" && { startMarker }),
    ...(loopStart !== startMarker && { loopStart }),
    timeSignature: clip.timeSignature,
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
    result.arrangementStartTime = abletonBeatsToBarBeat(
      clip.getProperty("start_time"),
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
      127,
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

  return result;
}
