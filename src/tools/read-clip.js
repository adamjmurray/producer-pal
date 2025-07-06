// src/tools/read-clip.js
import {
  abletonBeatsToBarBeat,
  abletonBeatsToBarBeatDuration,
} from "../notation/barbeat/barbeat-time.js";
import { formatNotation } from "../notation/notation.js";
/**
 * Read a MIDI clip from Ableton Live and return its notes as a notation string
 * @param {Object} args - Arguments for the function
 * @param {number} [args.trackIndex] - Track index (0-based)
 * @param {number} [args.clipSlotIndex] - Clip slot index (0-based)
 * @param {string} [args.clipId] - Clip ID to directly access any clip
 * @param {boolean} [args.includeNotes] - Whether to include notes data (default: true)
 * @returns {Object} Result object with clip information
 */
export function readClip({
  trackIndex = null,
  clipSlotIndex = null,
  clipId = null,
  includeNotes = true,
}) {
  if (clipId === null && (trackIndex === null || clipSlotIndex === null)) {
    throw new Error(
      "Either clipId or both trackIndex and clipSlotIndex must be provided",
    );
  }

  // Support "id {id}" (such as returned by childIds()) and id values directly
  // TODO: Need test coverage of this logic
  const clip =
    clipId != null
      ? LiveAPI.from(clipId)
      : new LiveAPI(
          `live_set tracks ${trackIndex} clip_slots ${clipSlotIndex} clip`,
        );

  if (!clip.exists()) {
    if (clipId != null)
      throw new Error(`No clip exists for clipId "${clipId}"`);
    return {
      id: null,
      type: null,
      name: null,
      trackIndex,
      clipSlotIndex,
    };
  }

  const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;
  const timeSigNumerator = clip.getProperty("signature_numerator");
  const timeSigDenominator = clip.getProperty("signature_denominator");

  const isLooping = clip.getProperty("looping") > 0;
  const lengthBeats = clip.getProperty("length"); // Live API already gives us the effective length!

  const result = {
    id: clip.id,
    type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
    name: clip.getProperty("name"),
    view: isArrangementClip ? "arrangement" : "session",
    color: clip.getColor(),
    loop: isLooping,
    length: abletonBeatsToBarBeatDuration(
      lengthBeats,
      timeSigNumerator,
      timeSigDenominator,
    ),
    startMarker: abletonBeatsToBarBeat(
      clip.getProperty("start_marker"),
      timeSigNumerator,
      timeSigDenominator,
    ),
    loopStart: abletonBeatsToBarBeat(
      clip.getProperty("loop_start"),
      timeSigNumerator,
      timeSigDenominator,
    ),
    isPlaying: clip.getProperty("is_playing") > 0,
    isTriggered: clip.getProperty("is_triggered") > 0,
    timeSignature: `${timeSigNumerator}/${timeSigDenominator}`,
  };

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
    result.clipSlotIndex = clip.clipSlotIndex;
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
    if (includeNotes) {
      result.notes = formatNotation(notes, {
        timeSigNumerator,
        timeSigDenominator,
      });
    }
  }

  return result;
}
