// src/tools/update-clip.js
import { barBeatToAbletonBeats } from "../notation/barbeat/barbeat-time";
import { parseNotation } from "../notation/notation";
import { MAX_CLIP_BEATS } from "./constants.js";

/**
 * Updates properties of existing clips
 * @param {Object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string
 * @param {boolean} [args.clearExistingNotes=true] - Whether to replace all notes (true) or add to existing notes (false)
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.startMarker] - Start marker position in bar:beat format
 * @param {string} [args.endMarker] - End marker position in bar:beat format
 * @param {string} [args.loopStart] - Loop start position in bar:beat format
 * @param {string} [args.loopEnd] - Loop end position in bar:beat format
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @returns {Object|Array<Object>} Single clip object or array of clip objects
 */
export function updateClip({
  ids,
  notes: notationString,
  clearExistingNotes = true,
  name,
  color,
  timeSignature,
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

  const updatedClips = [];
  let isFirstClip = true;

  for (const id of clipIds) {
    // Convert string ID to LiveAPI path if needed
    const clip = LiveAPI.from(id);

    if (!clip.exists()) {
      throw new Error(`updateClip failed: clip with id "${id}" does not exist`);
    }

    // Parse time signature if provided to get numerator/denominator
    let timeSigNumerator, timeSigDenominator;
    if (timeSignature != null) {
      const match = timeSignature.match(/^(\d+)\/(\d+)$/);
      if (!match) {
        throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
      }
      timeSigNumerator = Number.parseInt(match[1]);
      timeSigDenominator = Number.parseInt(match[2]);
    } else {
      timeSigNumerator = clip.getProperty("signature_numerator");
      timeSigDenominator = clip.getProperty("signature_denominator");
    }

    clip.setAll({
      name: name,
      color: color,
      signature_numerator: timeSignature != null ? timeSigNumerator : null,
      signature_denominator: timeSignature != null ? timeSigDenominator : null,
      start_marker:
        startMarker != null ? barBeatToAbletonBeats(startMarker, timeSigNumerator, timeSigDenominator) : null,
      end_marker: endMarker != null ? barBeatToAbletonBeats(endMarker, timeSigNumerator, timeSigDenominator) : null,
      loop_start: loopStart != null ? barBeatToAbletonBeats(loopStart, timeSigNumerator, timeSigDenominator) : null,
      loop_end: loopEnd != null ? barBeatToAbletonBeats(loopEnd, timeSigNumerator, timeSigDenominator) : null,
      looping: loop,
    });

    if (notationString != null) {
      const notes = parseNotation(notationString, {
        timeSigNumerator,
        timeSigDenominator,
      });

      if (clearExistingNotes) {
        clip.call("remove_notes_extended", 0, 127, 0, MAX_CLIP_BEATS);
      }

      if (notes.length > 0) {
        clip.call("add_new_notes", { notes });
      }
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
    if (timeSignature != null) clipResult.timeSignature = timeSignature;
    if (startMarker != null) clipResult.startMarker = startMarker;
    if (endMarker != null) clipResult.endMarker = endMarker;
    if (loopStart != null) clipResult.loopStart = loopStart;
    if (loopEnd != null) clipResult.loopEnd = loopEnd;
    if (loop != null) clipResult.loop = loop;
    if (notationString != null) clipResult.notes = notationString;
    if (notationString != null) clipResult.clearExistingNotes = clearExistingNotes;

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
