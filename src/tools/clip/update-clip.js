import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time";
import { interpretNotation, formatNotation } from "../../notation/notation";
import { MAX_CLIP_BEATS } from "../constants.js";
import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";

/**
 * Updates properties of existing clips
 * @param {Object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string
 * @param {string} args.noteUpdateMode - How to handle existing notes: 'replace' or 'merge'
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
  noteUpdateMode,
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

    // Track final note count for response
    let finalNoteCount = null;

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
      let combinedNotationString = notationString;

      if (noteUpdateMode === "merge") {
        // In merge mode, prepend existing notes as bar|beat notation
        const existingNotesResult = JSON.parse(
          clip.call("get_notes_extended", 0, 127, 0, MAX_CLIP_BEATS),
        );
        const existingNotes = existingNotesResult?.notes || [];

        if (existingNotes.length > 0) {
          const existingNotationString = formatNotation(existingNotes, {
            timeSigNumerator,
            timeSigDenominator,
          });
          combinedNotationString = `${existingNotationString} ${notationString}`;
        }
      }

      const notes = interpretNotation(combinedNotationString, {
        timeSigNumerator,
        timeSigDenominator,
      });

      // Remove all notes and add new notes (v0s already filtered by applyV0Deletions)
      clip.call("remove_notes_extended", 0, 127, 0, MAX_CLIP_BEATS);
      if (notes.length > 0) {
        clip.call("add_new_notes", { notes });
      }

      // Query actual note count within playback region (consistent with read-clip)
      const lengthBeats = clip.getProperty("length");
      const actualNotesResult = JSON.parse(
        clip.call("get_notes_extended", 0, 127, 0, lengthBeats),
      );
      finalNoteCount = actualNotesResult?.notes?.length || 0;
    }

    // Determine view and indices from clip path
    const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;
    let trackIndex, sceneIndex, arrangementStartTime;

    if (isArrangementClip) {
      trackIndex = clip.trackIndex;
      arrangementStartTime = clip.getProperty("start_time");
    } else {
      trackIndex = clip.trackIndex;
      sceneIndex = clip.sceneIndex;
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
      clipResult.sceneIndex = sceneIndex;
    }

    // Only include properties that were actually set
    if (name != null) clipResult.name = name;
    if (color != null) clipResult.color = color;
    if (timeSignature != null) clipResult.timeSignature = timeSignature;
    if (startMarker != null) clipResult.startMarker = startMarker;
    if (length != null) clipResult.length = length;
    if (loopStart != null) clipResult.loopStart = loopStart;
    if (loop != null) clipResult.loop = loop;
    if (finalNoteCount != null) clipResult.noteCount = finalNoteCount;

    updatedClips.push(clipResult);
  }

  // Return single object if single ID was provided, array if comma-separated IDs were provided
  return clipIds.length > 1 ? updatedClips : updatedClips[0];
}
