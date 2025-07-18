// src/tools/update-clip.js
import {
  barBeatToAbletonBeats,
  barBeatDurationToAbletonBeats,
} from "../notation/barbeat/barbeat-time";
import { parseNotation } from "../notation/notation";
import { parseCommaSeparatedIds, parseTimeSignature } from "../utils.js";
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
 * @param {string} [args.startMarker] - Start marker position in bar|beat format relative to clip start
 * @param {string} [args.length] - Clip length in bar:beat duration format (e.g., '4:0' = 4 bars)
 * @param {string} [args.loopStart] - Loop start position in bar|beat format relative to clip start
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
  length,
  loop,
  loopStart,
} = {}) {
  if (!ids) {
    throw new Error("updateClip failed: ids is required");
  }

  // Parse comma-separated string into array
  const clipIds = parseCommaSeparatedIds(ids);

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
      const parsed = parseTimeSignature(timeSignature);
      timeSigNumerator = parsed.numerator;
      timeSigDenominator = parsed.denominator;
    } else {
      timeSigNumerator = clip.getProperty("signature_numerator");
      timeSigDenominator = clip.getProperty("signature_denominator");
    }

    // Convert length parameter to end_marker and loop_end
    let endMarkerBeats = null;
    let loopEndBeats = null;
    if (length != null) {
      const lengthBeats = barBeatDurationToAbletonBeats(
        length,
        timeSigNumerator,
        timeSigDenominator,
      );
      const startMarkerBeats =
        barBeatToAbletonBeats(
          startMarker,
          timeSigNumerator,
          timeSigDenominator,
        ) || 0;
      endMarkerBeats = startMarkerBeats + lengthBeats;
      loopEndBeats = startMarkerBeats + lengthBeats;
    }

    clip.setAll({
      name: name,
      color: color,
      signature_numerator: timeSignature != null ? timeSigNumerator : null,
      signature_denominator: timeSignature != null ? timeSigDenominator : null,
      start_marker: barBeatToAbletonBeats(
        startMarker,
        timeSigNumerator,
        timeSigDenominator,
      ),
      end_marker: endMarkerBeats,
      loop_start: barBeatToAbletonBeats(
        loopStart,
        timeSigNumerator,
        timeSigDenominator,
      ),
      loop_end: loopEndBeats,
      looping: loop,
    });

    if (notationString != null) {
      const notes = parseNotation(notationString, {
        timeSigNumerator,
        timeSigDenominator,
      });

      // Separate v0 notes (deletion requests) from regular notes
      const v0Notes = notes.filter((note) => note.velocity === 0);
      const regularNotes = notes.filter((note) => note.velocity > 0);

      if (clearExistingNotes) {
        clip.call("remove_notes_extended", 0, 127, 0, MAX_CLIP_BEATS);
        // Only add regular notes when clearing (v0 notes are filtered out for Live API)
        if (regularNotes.length > 0) {
          clip.call("add_new_notes", { notes: regularNotes });
        }
      } else {
        // When not clearing, handle v0 notes as deletions
        if (v0Notes.length > 0) {
          // Get existing notes and parse the JSON result
          const existingNotesResult = JSON.parse(
            clip.call("get_notes_extended", 0, 127, 0, MAX_CLIP_BEATS),
          );
          const existingNotes = existingNotesResult?.notes || [];

          // Filter out notes that match v0 note pitch and start time
          const filteredExistingNotes = existingNotes.filter((existingNote) => {
            return !v0Notes.some(
              (v0Note) =>
                v0Note.pitch === existingNote.pitch &&
                Math.abs(v0Note.start_time - existingNote.start_time) < 0.001,
            );
          });

          // Clean up existing notes to only include properties that add_new_notes accepts
          const cleanExistingNotes = filteredExistingNotes.map((note) => ({
            pitch: note.pitch,
            start_time: note.start_time,
            duration: note.duration,
            velocity: note.velocity,
            probability: note.probability,
            velocity_deviation: note.velocity_deviation,
          }));

          // Remove all notes and add back filtered existing notes plus new regular notes
          clip.call("remove_notes_extended", 0, 127, 0, MAX_CLIP_BEATS);
          const allNotesToAdd = [...cleanExistingNotes, ...regularNotes];
          if (allNotesToAdd.length > 0) {
            clip.call("add_new_notes", { notes: allNotesToAdd });
          }
        } else {
          // No v0 notes, just add regular notes
          if (regularNotes.length > 0) {
            clip.call("add_new_notes", { notes: regularNotes });
          }
        }
      }
    }

    // Determine view and indices from clip path
    const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;
    let trackIndex, clipSlotIndex, arrangementStartTime;

    if (isArrangementClip) {
      trackIndex = clip.trackIndex;
      arrangementStartTime = clip.getProperty("start_time");
    } else {
      trackIndex = clip.trackIndex;
      clipSlotIndex = clip.clipSlotIndex;
    }

    if (trackIndex == null) {
      throw new Error(
        `updateClip failed: could not determine trackIndex for id "${id}" (path="${clip.path}")`,
      );
    }

    // Build optimistic result object
    const clipResult = {
      id: clip.id,
      type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
      view: isArrangementClip ? "arrangement" : "session",
      trackIndex,
    };

    // Add view-specific properties
    if (isArrangementClip) {
      clipResult.arrangementStartTime = arrangementStartTime;
    } else {
      clipResult.clipSlotIndex = clipSlotIndex;
    }

    // Only include properties that were actually set
    if (name != null) clipResult.name = name;
    if (color != null) clipResult.color = color;
    if (timeSignature != null) clipResult.timeSignature = timeSignature;
    if (startMarker != null) clipResult.startMarker = startMarker;
    if (length != null) clipResult.length = length;
    if (loopStart != null) clipResult.loopStart = loopStart;
    if (loop != null) clipResult.loop = loop;
    if (notationString != null) clipResult.notes = notationString;
    if (notationString != null)
      clipResult.clearExistingNotes = clearExistingNotes;

    updatedClips.push(clipResult);

    if (isFirstClip) {
      const appView = new LiveAPI("live_app view");
      const songView = new LiveAPI("live_set view");
      appView.call("show_view", isArrangementClip ? "Arranger" : "Session");
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
