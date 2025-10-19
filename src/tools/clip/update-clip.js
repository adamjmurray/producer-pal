import {
  abletonBeatsToBarBeat,
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import { interpretNotation, formatNotation } from "../../notation/notation.js";
import { evaluateModulation } from "../../notation/modulation/modulation-evaluator.js";
import { MAX_CLIP_BEATS } from "../constants.js";
import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";

/**
 * Updates properties of existing clips
 * @param {Object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.modulations] - Modulation expressions (parameter: expression per line)
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
  modulations: modulationString,
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

  // Validate all IDs are clips, skip invalid ones
  const clips = validateIdTypes(clipIds, "clip", "updateClip", {
    skipInvalid: true,
  });

  const updatedClips = [];

  for (const clip of clips) {
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

    if (notationString != null || modulationString != null) {
      let notes;

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

        notes = interpretNotation(combinedNotationString, {
          timeSigNumerator,
          timeSigDenominator,
        });
      } else {
        // No notation provided, but modulations are - use existing notes
        if (noteUpdateMode === "merge") {
          const existingNotesResult = JSON.parse(
            clip.call("get_notes_extended", 0, 127, 0, MAX_CLIP_BEATS),
          );
          const existingNotes = existingNotesResult?.notes || [];
          // Filter to only valid fields for add_new_notes
          notes = existingNotes.map((note) => ({
            pitch: note.pitch,
            start_time: note.start_time,
            duration: note.duration,
            velocity: note.velocity,
            probability: note.probability,
            velocity_deviation: note.velocity_deviation,
          }));
        } else {
          // Replace mode with no notes means clear the clip
          notes = [];
        }
      }

      // Apply modulations to notes if provided
      if (modulationString != null && notes.length > 0) {
        for (const note of notes) {
          // Convert note's Ableton beats start_time to musical beats position
          const musicalBeats = note.start_time * (timeSigDenominator / 4);

          // Parse bar|beat position for time range filtering
          const barBeatStr = abletonBeatsToBarBeat(
            note.start_time,
            timeSigNumerator,
            timeSigDenominator,
          );
          const barBeatMatch = barBeatStr.match(/^(\d+)\|(\d+(?:\.\d+)?)$/);
          const bar = barBeatMatch ? Number.parseInt(barBeatMatch[1]) : null;
          const beat = barBeatMatch ? Number.parseFloat(barBeatMatch[2]) : null;

          // Evaluate modulations for this note
          const modulations = evaluateModulation(modulationString, {
            position: musicalBeats,
            pitch: note.pitch,
            bar,
            beat,
            timeSig: {
              numerator: timeSigNumerator,
              denominator: timeSigDenominator,
            },
          });

          // Apply modulations with operator semantics and range clamping
          if (modulations.velocity != null) {
            if (modulations.velocity.operator === "set") {
              note.velocity = Math.max(
                1,
                Math.min(127, modulations.velocity.value),
              );
            } else {
              // operator === "add"
              note.velocity = Math.max(
                1,
                Math.min(127, note.velocity + modulations.velocity.value),
              );
            }
          }

          if (modulations.timing != null) {
            // Timing modulates start_time directly (in Ableton beats)
            if (modulations.timing.operator === "set") {
              note.start_time = modulations.timing.value;
            } else {
              // operator === "add"
              note.start_time += modulations.timing.value;
            }
          }

          if (modulations.duration != null) {
            if (modulations.duration.operator === "set") {
              note.duration = Math.max(0.001, modulations.duration.value);
            } else {
              // operator === "add"
              note.duration = Math.max(
                0.001,
                note.duration + modulations.duration.value,
              );
            }
          }

          if (modulations.probability != null) {
            if (modulations.probability.operator === "set") {
              note.probability = Math.max(
                0.0,
                Math.min(1.0, modulations.probability.value),
              );
            } else {
              // operator === "add"
              note.probability = Math.max(
                0.0,
                Math.min(1.0, note.probability + modulations.probability.value),
              );
            }
          }
        }
      }

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

    // Build optimistic result object
    const clipResult = {
      id: clip.id,
    };

    // Only include noteCount if notes were modified
    if (finalNoteCount != null) {
      clipResult.noteCount = finalNoteCount;
    }

    updatedClips.push(clipResult);
  }

  // Return single object if one valid result, array for multiple results or empty array for none
  if (updatedClips.length === 0) {
    return [];
  }
  return updatedClips.length === 1 ? updatedClips[0] : updatedClips;
}
