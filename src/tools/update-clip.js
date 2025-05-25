// src/tools/update-clip.js
import { parseNotation } from "../notation/notation";
import { MAX_CLIP_BEATS } from "./constants.js";

/**
 * Updates properties of existing clips
 * @param {Object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string (replaces existing notes)
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex)
 * @param {number} [args.startMarker] - Start marker position in beats
 * @param {number} [args.endMarker] - End marker position in beats
 * @param {number} [args.loopStart] - Loop start position in beats
 * @param {number} [args.loopEnd] - Loop end position in beats
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @returns {Object|Array<Object>} Single clip object or array of clip objects
 */
export function updateClip({
  ids,
  notes: notationString,
  name,
  color,
  startMarker,
  endMarker,
  loop,
  loopStart,
  loopEnd,
} = {}) {
  if (!ids) {
    throw new Error("updateClip failed: ids is required");
  }

  // Parse comma-separated string into array
  const clipIds = ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const notes = notationString != null ? parseNotation(notationString) : null;
  const updatedClips = [];
  let isFirstClip = true;

  for (const id of clipIds) {
    // Convert string ID to LiveAPI path if needed
    const clipPath = id.startsWith("id ") ? id : `id ${id}`;
    const clip = new LiveAPI(clipPath);

    if (!clip.exists()) {
      throw new Error(`updateClip failed: clip with id "${id}" does not exist`);
    }

    // Update properties if provided
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

    if (notationString != null) {
      clip.call("remove_notes_extended", 0, 127, 0, MAX_CLIP_BEATS);
      clip.call("add_new_notes", { notes });
    }

    // Determine view and indices from clip path
    const isArrangerClip = clip.getProperty("is_arrangement_clip") > 0;
    let trackIndex, clipSlotIndex, arrangerStartTime;

    if (isArrangerClip) {
      trackIndex = Number.parseInt(clip.path.match(/live_set tracks (\d+)/)?.[1]);
      arrangerStartTime = clip.getProperty("start_time");
    } else {
      const pathMatch = clip.path.match(/live_set tracks (\d+) clip_slots (\d+)/);
      trackIndex = Number.parseInt(pathMatch?.[1]);
      clipSlotIndex = Number.parseInt(pathMatch?.[2]);
    }

    if (Number.isNaN(trackIndex)) {
      throw new Error(`updateClip failed: could not determine trackIndex for id "${id}" (path="${clip.path}")`);
    }

    // Build optimistic result object
    const clipResult = {
      id: clip.id,
      type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
      view: isArrangerClip ? "Arranger" : "Session",
      trackIndex,
    };

    // Add view-specific properties
    if (isArrangerClip) {
      clipResult.arrangerStartTime = arrangerStartTime;
    } else {
      clipResult.clipSlotIndex = clipSlotIndex;
    }

    // Only include properties that were actually set
    if (name != null) clipResult.name = name;
    if (color != null) clipResult.color = color;
    if (startMarker != null) clipResult.startMarker = startMarker;
    if (endMarker != null) clipResult.endMarker = endMarker;
    if (loopStart != null) clipResult.loopStart = loopStart;
    if (loopEnd != null) clipResult.loopEnd = loopEnd;
    if (loop != null) clipResult.loop = loop;
    if (notationString != null) clipResult.notes = notationString;

    updatedClips.push(clipResult);

    if (isFirstClip) {
      const appView = new LiveAPI("live_app view");
      const songView = new LiveAPI("live_set view");
      const clipView = isArrangerClip ? "Arranger" : "Session";
      appView.call("show_view", clipView);
      songView.set("detail_clip", `id ${clip.id}`);
      appView.call("focus_view", "Detail/Clip");
      if (loop || clip.getProperty("looping")) {
        const clipViewAPI = new LiveAPI(`${clip.path} view`);
        clipViewAPI.call("show_loop");
      }
      isFirstClip = false;
    }
  }

  // Return single object if single ID was provided, array if comma-separated IDs were provided
  return clipIds.length > 1 ? updatedClips : updatedClips[0];
}
