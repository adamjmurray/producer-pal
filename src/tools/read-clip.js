// src/tools/read-clip.js
import { formatNotation } from "../notation";

/**
 * Read a MIDI clip from Ableton Live and return its notes as a ToneLang string
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

  const result = {
    id: clip.id,
    type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
    name: clip.getProperty("name"),
    view: isArrangerClip ? "Arranger" : "Session",
    color: clip.getColor(),
    loop: clip.getProperty("looping") > 0,
    length: clip.getProperty("length"),
    startMarker: clip.getProperty("start_marker"),
    endMarker: clip.getProperty("end_marker"),
    loopStart: clip.getProperty("loop_start"),
    loopEnd: clip.getProperty("loop_end"),
    isPlaying: clip.getProperty("is_playing") > 0,
    isTriggered: clip.getProperty("is_triggered") > 0,
  };

  if (isArrangerClip) {
    result.trackIndex = Number.parseInt(clip.path.match(/live_set tracks (\d+)/)[1]);
    result.arrangerStartTime = clip.getProperty("start_time");
  } else {
    const pathMatch = clip.path.match(/live_set tracks (\d+) clip_slots (\d+)/);
    result.trackIndex = Number.parseInt(pathMatch?.[1]);
    result.clipSlotIndex = Number.parseInt(pathMatch?.[2]);
  }

  if (result.type === "midi") {
    // Get the clip notes for MIDI clips
    const notesDictionary = clip.call("get_notes_extended", 0, 127, 0, result.length);
    const notes = JSON.parse(notesDictionary).notes;

    // Use a different ToneLang conversion algorithm for drum tracks and non-drums
    const track = new LiveAPI(`live_set tracks ${result.trackIndex}`);
    const isDrumTrack = !!track.getChildren("devices").find((device) => device.getProperty("can_have_drum_pads"));

    result.noteCount = notes.length;
    result.notes = formatNotation(notes, { isDrumTrack });
  }

  return result;
}
