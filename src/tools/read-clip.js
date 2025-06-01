// src/tools/read-clip.js
import { abletonBeatsToBarBeat } from "../notation/barbeat/barbeat-time";
import { formatNotation } from "../notation/notation";
/**
 * Read a MIDI clip from Ableton Live and return its notes as a notation string
 * @param {Object} args - Arguments for the function
 * @param {number} [args.trackIndex] - Track index (0-based)
 * @param {number} [args.clipSlotIndex] - Clip slot index (0-based)
 * @param {string} [args.clipId] - Clip ID to directly access any clip
 * @returns {Object} Result object with clip information
 */
export function readClip({ trackIndex = null, clipSlotIndex = null, clipId = null }) {
  if (clipId === null && (trackIndex === null || clipSlotIndex === null)) {
    throw new Error("Either clipId or both trackIndex and clipSlotIndex must be provided");
  }

  // Support "id {id}" (such as returned by childIds()) and id values directly
  // TODO: Need test coverage of this logic
  const clip =
    clipId != null
      ? LiveAPI.from(clipId)
      : new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex} clip`);

  if (!clip.exists()) {
    if (clipId != null) throw new Error(`No clip exists for clipId "${clipId}"`);
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

  const result = {
    id: clip.id,
    type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
    name: clip.getProperty("name"),
    view: isArrangementClip ? "Arrangement" : "Session",
    color: clip.getColor(),
    loop: clip.getProperty("looping") > 0,
    // convert "ableton beats" (quarter note offset) to musical beats, so it makes sense in e.g. 6/8 time signatures:
    length: (clip.getProperty("length") * timeSigDenominator) / 4,
    startMarker: abletonBeatsToBarBeat(clip.getProperty("start_marker"), timeSigNumerator, timeSigDenominator),
    endMarker: abletonBeatsToBarBeat(clip.getProperty("end_marker"), timeSigNumerator, timeSigDenominator),
    loopStart: abletonBeatsToBarBeat(clip.getProperty("loop_start"), timeSigNumerator, timeSigDenominator),
    loopEnd: abletonBeatsToBarBeat(clip.getProperty("loop_end"), timeSigNumerator, timeSigDenominator),
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
      songTimeSigDenominator
    );
  } else {
    result.trackIndex = clip.trackIndex;
    result.clipSlotIndex = clip.clipSlotIndex;
  }

  if (result.type === "midi") {
    const notesDictionary = clip.call("get_notes_extended", 0, 127, 0, result.length);
    const notes = JSON.parse(notesDictionary).notes;
    result.noteCount = notes.length;
    result.notes = formatNotation(notes, { timeSigNumerator, timeSigDenominator });
  }

  return result;
}
