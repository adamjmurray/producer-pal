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
  const clip = new LiveAPI(
    clipId != null
      ? typeof clipId === "string" && clipId.startsWith("id ")
        ? clipId
        : `id ${clipId}`
      : `live_set tracks ${trackIndex} clip_slots ${clipSlotIndex} clip`
  );

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

  const isArrangerClip = clip.getProperty("is_arrangement_clip") > 0;
  const timeSigNumerator = clip.getProperty("signature_numerator");
  const timeSigDenominator = clip.getProperty("signature_denominator");

  const result = {
    id: clip.id,
    type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
    name: clip.getProperty("name"),
    view: isArrangerClip ? "Arranger" : "Session",
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

  if (isArrangerClip) {
    const liveSet = new LiveAPI("live_set");
    const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    const songTimeSigDenominator = liveSet.getProperty("signature_denominator");
    result.trackIndex = Number.parseInt(clip.path.match(/live_set tracks (\d+)/)[1]);
    result.arrangerStartTime = abletonBeatsToBarBeat(
      clip.getProperty("start_time"),
      songTimeSigNumerator,
      songTimeSigDenominator
    );
  } else {
    const pathMatch = clip.path.match(/live_set tracks (\d+) clip_slots (\d+)/);
    result.trackIndex = Number.parseInt(pathMatch?.[1]);
    result.clipSlotIndex = Number.parseInt(pathMatch?.[2]);
  }

  if (result.type === "midi") {
    // Get the clip notes for MIDI clips
    const notesDictionary = clip.call("get_notes_extended", 0, 127, 0, result.length);
    const notes = JSON.parse(notesDictionary).notes;

    result.noteCount = notes.length;
    // TODO: pass time signature numerator and denominator into formatNotation (and parseNotation) to streamline this
    const abletonBeatsPerBar = (timeSigNumerator * 4) / timeSigDenominator; // 0-indexed quarter note offset
    result.notes = formatNotation(notes, { beatsPerBar: abletonBeatsPerBar });
  }

  return result;
}
