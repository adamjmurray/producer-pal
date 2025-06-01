// src/tools/create-clip.js
import { barBeatToAbletonBeats, barBeatToBeats, beatsToBarBeat } from "../notation/barbeat/barbeat-time";
import { parseNotation } from "../notation/notation";
import { parseTimeSignature, setAllNonNull } from "../utils.js";
import { MAX_AUTO_CREATED_SCENES } from "./constants.js";

/**
 * Creates MIDI clips in Session or Arranger view
 * @param {Object} args - The clip parameters
 * @param {string} args.view - View for the clip ('Session' or 'Arranger')
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} [args.clipSlotIndex] - Clip slot index (0-based), required for Session view
 * @param {string} [args.arrangerStartTime] - Start time in bar|beat format for Arranger view clips (uses song time signature)
 * @param {number} [args.count=1] - Number of clips to create
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.name] - Base name for the clips
 * @param {string} [args.color] - Color in #RRGGBB hex format
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.startMarker] - Start marker position in bar|beat format relative to clip start
 * @param {string} [args.endMarker] - End marker position in bar|beat format relative to clip start
 * @param {string} [args.loopStart] - Loop start position in bar|beat format relative to clip start
 * @param {string} [args.loopEnd] - Loop end position in bar|beat format relative to clip start
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @param {boolean} [args.autoplay=false] - Automatically play the clip after creating (Session only). Puts tracks into non-following state, stopping any currently playing Arrangement clips.
 * @returns {Object|Array<Object>} Single clip object when count=1, array when count>1
 */
export function createClip({
  view,
  trackIndex,
  clipSlotIndex = null,
  arrangerStartTime = null,
  count = 1,
  notes: notationString = null,
  name = null,
  color = null,
  timeSignature = null,
  startMarker = null,
  endMarker = null,
  loop = null,
  loopStart = null,
  loopEnd = null,
  autoplay = false,
}) {
  // Validate parameters
  if (!view) {
    throw new Error("createClip failed: view parameter is required");
  }

  if (trackIndex == null) {
    throw new Error("createClip failed: trackIndex is required");
  }

  if (view === "Session" && clipSlotIndex == null) {
    throw new Error("createClip failed: clipSlotIndex is required when view is 'Session'");
  }

  if (view === "Arranger" && arrangerStartTime == null) {
    throw new Error("createClip failed: arrangerStartTime is required when view is 'Arranger'");
  }

  if (count < 1) {
    throw new Error("createClip failed: count must be at least 1");
  }

  const liveSet = new LiveAPI("live_set");
  let timeSigNumerator, timeSigDenominator;
  let songTimeSigNumerator, songTimeSigDenominator;

  // Get song time signature for arrangerStartTime conversion
  songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);
    timeSigNumerator = parsed.numerator;
    timeSigDenominator = parsed.denominator;
  } else {
    // Use song time signature as default for clips
    timeSigNumerator = songTimeSigNumerator;
    timeSigDenominator = songTimeSigDenominator;
  }

  // Convert bar|beat timing parameters to Ableton beats
  const arrangerStartTimeBeats = barBeatToAbletonBeats(arrangerStartTime, songTimeSigNumerator, songTimeSigDenominator);
  const startMarkerBeats = barBeatToAbletonBeats(startMarker, timeSigNumerator, timeSigDenominator);
  const endMarkerBeats = barBeatToAbletonBeats(endMarker, timeSigNumerator, timeSigDenominator);
  const loopStartBeats = barBeatToAbletonBeats(loopStart, timeSigNumerator, timeSigDenominator);
  const loopEndBeats = barBeatToAbletonBeats(loopEnd, timeSigNumerator, timeSigDenominator);

  const notes =
    notationString != null
      ? parseNotation(notationString, {
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Determine clip length - assume clips start at 1.1 (beat 0)
  let clipLength;
  if (loop && loopEndBeats != null) {
    // For looping clips, use loopEnd
    clipLength = loopEndBeats;
  } else if (endMarkerBeats != null) {
    // For non-looping clips, use endMarker
    clipLength = endMarkerBeats;
  } else if (notes.length > 0) {
    // const lastNoteEndTime = Math.max(...notes.map((note) => note.start_time + note.duration));
    // clipLength = Math.ceil(lastNoteEndTime);

    const lastNoteEndTimeAbletonBeats = Math.max(...notes.map((note) => note.start_time + note.duration));

    // Convert back to musical beats to round up conceptually
    const lastNoteEndTimeMusicalBeats =
      timeSigDenominator != null ? lastNoteEndTimeAbletonBeats * (timeSigDenominator / 4) : lastNoteEndTimeAbletonBeats;

    // Round up to whole musical beats
    const clipLengthMusicalBeats = Math.ceil(lastNoteEndTimeMusicalBeats);

    // Convert back to Ableton beats for the Live API
    clipLength =
      timeSigDenominator != null ? clipLengthMusicalBeats * (4 / timeSigDenominator) : clipLengthMusicalBeats;
  } else {
    // Empty clip, use 1 beat minimum
    clipLength = 1;
  }

  const createdClips = [];

  for (let i = 0; i < count; i++) {
    // Build the clip name
    const clipName = name != null ? (count === 1 ? name : i === 0 ? name : `${name} ${i + 1}`) : undefined;

    let clip;
    let currentClipSlotIndex, currentArrangerStartTimeBeats;

    if (view === "Session") {
      currentClipSlotIndex = clipSlotIndex + i;

      // Auto-create scenes if needed
      if (currentClipSlotIndex >= MAX_AUTO_CREATED_SCENES) {
        throw new Error(
          `createClip failed: clip slot index ${currentClipSlotIndex} exceeds the maximum allowed value of ${
            MAX_AUTO_CREATED_SCENES - 1
          }`
        );
      }

      const currentSceneCount = liveSet.getChildIds("scenes").length;

      if (currentClipSlotIndex >= currentSceneCount) {
        const scenesToCreate = currentClipSlotIndex - currentSceneCount + 1;
        for (let j = 0; j < scenesToCreate; j++) {
          liveSet.call("create_scene", -1); // -1 means append at the end
        }
      }

      const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${currentClipSlotIndex}`);
      if (clipSlot.getProperty("has_clip")) {
        throw new Error(
          `createClip failed: a clip already exists at track ${trackIndex}, clip slot ${currentClipSlotIndex}`
        );
      }
      clipSlot.call("create_clip", clipLength);
      clip = new LiveAPI(`${clipSlot.path} clip`);
    } else {
      // Arranger view
      currentArrangerStartTimeBeats = arrangerStartTimeBeats + i * clipLength;

      const track = new LiveAPI(`live_set tracks ${trackIndex}`);
      if (!track.exists()) {
        throw new Error(`createClip failed: track with index ${trackIndex} does not exist`);
      }

      const newClipResult = track.call("create_midi_clip", currentArrangerStartTimeBeats, clipLength);
      clip = LiveAPI.from(newClipResult);
      if (!clip.exists()) {
        throw new Error("createClip failed: failed to create Arranger clip");
      }
    }

    clip.setAll({
      name: clipName,
      color: color,
      signature_numerator: timeSigNumerator,
      signature_denominator: timeSigDenominator,
      start_marker: startMarkerBeats,
      end_marker: endMarkerBeats,
      loop_start: loopStartBeats,
      loop_end: loopEndBeats,
      looping: loop,
    });

    if (notes.length > 0) {
      clip.call("add_new_notes", { notes });
    }

    // Build optimistic result object
    const clipResult = {
      id: clip.id,
      type: "midi",
      view,
      trackIndex,
    };

    // Add view-specific properties
    if (view === "Session") {
      clipResult.clipSlotIndex = currentClipSlotIndex;
    } else {
      // Calculate bar|beat position for this clip
      if (i === 0) {
        clipResult.arrangerStartTime = arrangerStartTime;
      } else {
        // Convert clipLength back to bar|beat format and add to original position
        const clipLengthInMusicalBeats = clipLength * (songTimeSigDenominator / 4);
        const totalOffsetBeats = i * clipLengthInMusicalBeats;
        const originalBeats = barBeatToBeats(arrangerStartTime, songTimeSigNumerator);
        const newPositionBeats = originalBeats + totalOffsetBeats;
        clipResult.arrangerStartTime = beatsToBarBeat(newPositionBeats, songTimeSigNumerator);
      }
    }

    setAllNonNull(clipResult, {
      name: clipName,
      color,
      timeSignature:
        timeSigNumerator != null && timeSigDenominator != null ? `${timeSigNumerator}/${timeSigDenominator}` : null,
      startMarker,
      endMarker,
      loopStart,
      loopEnd,
      loop,
      notes: notationString,
    });

    createdClips.push(clipResult);

    if (i === 0) {
      const appView = new LiveAPI("live_app view");
      const songView = new LiveAPI("live_set view");
      appView.call("show_view", view);
      songView.set("detail_clip", `id ${clip.id}`);
      appView.call("focus_view", "Detail/Clip");
      if (loop) {
        const clipView = new LiveAPI(`${clip.path} view`);
        clipView.call("show_loop");
      }
    }
  }

  // Handle autoplay for Session clips
  if (autoplay && view === "Session") {
    for (let i = 0; i < count; i++) {
      const currentClipSlotIndex = clipSlotIndex + i;
      const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${currentClipSlotIndex}`);
      clipSlot.call("fire");
      // Mark as triggered in optimistic results
      createdClips[i].isTriggered = true;
    }
  }

  // Return single object if count=1, array if count>1
  return count === 1 ? createdClips[0] : createdClips;
}
