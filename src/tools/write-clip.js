// src/tools/write-clip.js
import { parseNotation } from "../notation";
import { readClip } from "./read-clip";

// Maximum number of scenes we'll auto-create
export const MAX_AUTO_CREATED_SCENES = 100;
export const MAX_CLIP_BEATS = 1_000_000;

/**
 * Creates or updates a MIDI clip in Session or Arranger view
 * @param {Object} args - The clip parameters
 * @param {string} args.view - View for the clip ('Session' or 'Arranger')
 * @param {number} [args.trackIndex] - Track index (0-based), required when not providing clipId
 * @param {number} [args.clipSlotIndex] - Clip slot index (0-based), required for Session view when not providing clipId
 * @param {string} [args.clipId] - Clip ID to directly update an existing clip
 * @param {number} [args.arrangerStartTime] - Start time in beats for Arranger view clips
 * @param {string} [args.notes] - ToneLang musical notation string
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex, rgb(), or named color)
 * @param {number} [args.startMarker] - Start marker position in beats
 * @param {number} [args.endMarker] - End marker position in beats
 * @param {number} [args.loopStart] - Loop start position in beats
 * @param {number} [args.loopEnd] - Loop end position in beats
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @param {boolean} [args.autoplay=false] - Automatically play the clip after creating it (Session only)
 * @returns {Object} Result object with clip information
 */
export function writeClip({
  view,
  trackIndex = null,
  clipSlotIndex = null,
  clipId = null,
  arrangerStartTime = null,
  notes: toneLangString = null,
  name = null,
  color = null,
  startMarker = null,
  endMarker = null,
  loop = null,
  loopStart = null,
  loopEnd = null,
  autoplay = false,
}) {
  // Validate parameters based on view
  if (!view) {
    throw new Error("view parameter is required");
  }

  if (clipId === null) {
    if (trackIndex === null) {
      throw new Error("trackIndex is required when clipId is not provided");
    }

    if (view === "Session" && clipSlotIndex === null) {
      throw new Error("clipSlotIndex is required when view is 'Session' and clipId is not provided");
    }

    if (view === "Arranger" && arrangerStartTime === null) {
      throw new Error("arrangerStartTime is required when view is 'Arranger' and clipId is not provided");
    }
  }

  const notes = parseNotation(toneLangString);
  let clip;

  // Handle existing clip via clipId
  if (clipId !== null) {
    // Support "id {id}" (such as returned by childIds()) and id values directly
    // TODO: Need test coverage of this logic
    clip = new LiveAPI(clipId.startsWith("id ") ? clipId : `id ${clipId}`);
    if (!clip.exists()) {
      throw new Error(`No clip exists for clipId "${clipId}"`);
    }
  }
  // Handle creating/updating Session view clip
  else if (view === "Session") {
    const liveSet = new LiveAPI("live_set");
    const currentSceneCount = liveSet.getChildIds("scenes").length;

    if (clipSlotIndex >= MAX_AUTO_CREATED_SCENES) {
      throw new Error(
        `Clip slot index ${clipSlotIndex} exceeds the maximum allowed value of ${MAX_AUTO_CREATED_SCENES - 1}`
      );
    }

    if (clipSlotIndex >= currentSceneCount) {
      const scenesToCreate = clipSlotIndex - currentSceneCount + 1;
      for (let i = 0; i < scenesToCreate; i++) {
        liveSet.call("create_scene", -1); // -1 means append at the end
      }
    }

    const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);

    const lastNoteEndTime = notes.length > 0 ? Math.max(...notes.map((note) => note.start_time + note.duration)) : 0;
    const clipLength = Math.max(4, Math.ceil(lastNoteEndTime));

    if (!clipSlot.getProperty("has_clip")) {
      clipSlot.call("create_clip", clipLength);
    }

    clip = new LiveAPI(`${clipSlot.path} clip`);
  }
  // Handle creating Arranger view clip
  else if (view === "Arranger") {
    const track = new LiveAPI(`live_set tracks ${trackIndex}`);
    if (!track.exists()) {
      throw new Error(`Track with index ${trackIndex} does not exist`);
    }

    const lastNoteEndTime = notes.length > 0 ? Math.max(...notes.map((note) => note.start_time + note.duration)) : 0;
    const clipLength = Math.max(4, Math.ceil(lastNoteEndTime));

    // Create the Arranger clip
    const newClipId = track.call("create_midi_clip", arrangerStartTime, clipLength)[1];
    clip = new LiveAPI(`id ${newClipId}`);
    if (!clip.exists()) {
      throw new Error("Failed to create Arranger clip");
    }
  } else {
    throw new Error(`Invalid view: ${view}`);
  }

  if (name != null) {
    clip.set("name", name);
  }

  if (color != null) {
    clip.setColor(color);
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

  if (toneLangString != null) {
    clip.call("remove_notes_extended", 0, 127, 0, MAX_CLIP_BEATS);
    clip.call("add_new_notes", { notes });
  }

  // Switch app view to match the clip view
  const appView = new LiveAPI("live_app view");
  appView.call("show_view", view);

  if (autoplay && view === "Session") {
    const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);
    clipSlot.call("fire");
  }

  return {
    ...readClip({ clipId: clip.id }),
    ...(autoplay ? { isTriggered: true } : {}), // state won't be updated yet unless we sleep(), so use optimistic results
  };
}
