// src/tools/create-clip.js
import { parseNotation } from "../notation/notation";
import { MAX_AUTO_CREATED_SCENES } from "./constants.js";

/**
 * Creates MIDI clips in Session or Arranger view
 * @param {Object} args - The clip parameters
 * @param {string} args.view - View for the clip ('Session' or 'Arranger')
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} [args.clipSlotIndex] - Clip slot index (0-based), required for Session view
 * @param {number} [args.arrangerStartTime] - Start time in beats for Arranger view clips
 * @param {number} [args.count=1] - Number of clips to create
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.name] - Base name for the clips
 * @param {string} [args.color] - Color in #RRGGBB hex format
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {number} [args.startMarker] - Start marker position in beats
 * @param {number} [args.endMarker] - End marker position in beats
 * @param {number} [args.loopStart] - Loop start position in beats
 * @param {number} [args.loopEnd] - Loop end position in beats
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @param {boolean} [args.autoplay=false] - Automatically play the clip after creating it (Session only)
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

  let timeSigNumerator, timeSigDenominator;

  if (timeSignature != null) {
    const match = timeSignature.match(/^(\d+)\/(\d+)$/);
    if (!match) {
      throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
    }
    timeSigNumerator = parseInt(match[1], 10);
    timeSigDenominator = parseInt(match[2], 10);
  } else {
    // Read time signature from song
    const liveSet = new LiveAPI("live_set");
    timeSigNumerator = liveSet.getProperty("signature_numerator");
    timeSigDenominator = liveSet.getProperty("signature_denominator");
  }

  const notes =
    notationString != null
      ? parseNotation(notationString, {
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Determine clip length - assume clips start at 1.1 (beat 0)
  let clipLength;
  if (loop && loopEnd != null) {
    // For looping clips, use loopEnd
    clipLength = loopEnd;
  } else if (endMarker != null) {
    // For non-looping clips, use endMarker
    clipLength = endMarker;
  } else if (notes.length > 0) {
    // Calculate from notes, round up to nearest whole beat
    const lastNoteEndTime = Math.max(...notes.map((note) => note.start_time + note.duration));
    clipLength = Math.ceil(lastNoteEndTime);
  } else {
    // Empty clip, use 1 beat minimum
    clipLength = 1;
  }

  const createdClips = [];

  for (let i = 0; i < count; i++) {
    // Build the clip name
    const clipName = name != null ? (count === 1 ? name : i === 0 ? name : `${name} ${i + 1}`) : undefined;

    let clip;
    let currentClipSlotIndex, currentArrangerStartTime;

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

      const liveSet = new LiveAPI("live_set");
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
      currentArrangerStartTime = arrangerStartTime + i * clipLength;

      const track = new LiveAPI(`live_set tracks ${trackIndex}`);
      if (!track.exists()) {
        throw new Error(`createClip failed: track with index ${trackIndex} does not exist`);
      }

      const newClipId = track.call("create_midi_clip", currentArrangerStartTime, clipLength)[1];
      clip = new LiveAPI(`id ${newClipId}`);
      if (!clip.exists()) {
        throw new Error("createClip failed: failed to create Arranger clip");
      }
    }

    // Set clip properties
    if (clipName != null) {
      clip.set("name", clipName);
    }

    if (color != null) {
      clip.setColor(color);
    }

    if (timeSigNumerator != null) {
      clip.set("signature_numerator", timeSigNumerator);
    }
    if (timeSigDenominator != null) {
      clip.set("signature_denominator", timeSigDenominator);
    }

    if (startMarker != null) {
      clip.set("start_marker", startMarker);
    }

    if (endMarker != null) {
      clip.set("end_marker", endMarker);
    }

    if (loopStart != null) {
      clip.set("loop_start", loopStart);
    }

    if (loopEnd != null) {
      clip.set("loop_end", loopEnd);
    }

    if (loop != null) {
      clip.set("looping", loop);
    }

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
      clipResult.arrangerStartTime = currentArrangerStartTime;
    }

    // Only include properties that were actually set
    if (clipName != null) clipResult.name = clipName;
    if (color != null) clipResult.color = color;
    if (timeSigNumerator != null && timeSigDenominator != null) {
      clipResult.timeSignature = `${timeSigNumerator}/${timeSigDenominator}`;
    }
    if (startMarker != null) clipResult.startMarker = startMarker;
    if (endMarker != null) clipResult.endMarker = endMarker;
    if (loopStart != null) clipResult.loopStart = loopStart;
    if (loopEnd != null) clipResult.loopEnd = loopEnd;
    if (loop != null) clipResult.loop = loop;
    if (notationString != null) clipResult.notes = notationString;

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
