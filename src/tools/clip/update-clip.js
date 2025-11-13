import { formatNotation } from "../../notation//barbeat/barbeat-format-notation.js";
import { interpretNotation } from "../../notation//barbeat/barbeat-interpreter.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import {
  MAX_CLIP_BEATS,
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_TONES,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_PRO,
  WARP_MODE,
} from "../constants.js";
import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";

/**
 * Calculate dynamic holding area for temporary clip operations
 * Returns safe position at highest bar + 10 bars (minimum bar 10)
 * @param {Object} liveSet - LiveAPI instance for live_set
 * @returns {Object} { bar, startBeats, abletonBeatsPerBar }
 */
function calculateHoldingArea(liveSet) {
  const timeSigNumerator = liveSet.getProperty("signature_numerator");
  const timeSigDenominator = liveSet.getProperty("signature_denominator");
  const abletonBeatsPerBar = (timeSigNumerator / timeSigDenominator) * 4;

  const trackCount = liveSet.getChildIds("tracks").length;
  let highestEndTime = 0;

  for (let i = 0; i < trackCount; i++) {
    const track = new LiveAPI(`live_set tracks ${i}`);
    const clipIds = track.getChildIds("arrangement_clips");

    for (const clipId of clipIds) {
      const clip = new LiveAPI(`id ${clipId}`);
      const endTime = clip.getProperty("end_time");
      highestEndTime = Math.max(highestEndTime, endTime);
    }
  }

  const highestBar = Math.ceil(highestEndTime / abletonBeatsPerBar);
  const holdingBar = Math.max(highestBar + 10, 10);
  const holdingAreaStart = holdingBar * abletonBeatsPerBar;

  return { bar: holdingBar, startBeats: holdingAreaStart, abletonBeatsPerBar };
}

/**
 * Check for overlapping clips in target range
 * Throws if any clips (except excludeClipId) overlap the range
 * @param {Object} track - LiveAPI track instance
 * @param {number} targetStart - Start position in beats
 * @param {number} targetEnd - End position in beats
 * @param {string} excludeClipId - Clip ID to exclude from check
 */
function checkAdjacentClipConflict(
  track,
  targetStart,
  targetEnd,
  excludeClipId,
) {
  const existingClips = track.getChildIds("arrangement_clips");

  for (const clipId of existingClips) {
    // Handle both "id 789" and "789" formats
    const normalizedClipId = String(clipId).replace(/^id\s+/, "");
    const normalizedExcludeId = String(excludeClipId).replace(/^id\s+/, "");

    if (normalizedClipId === normalizedExcludeId) {
      continue;
    }

    const clip = LiveAPI.from(clipId);
    const clipStart = clip.getProperty("start_time");
    const clipEnd = clip.getProperty("end_time");

    // Check for overlap
    if (
      (clipStart >= targetStart && clipStart < targetEnd) ||
      (clipEnd > targetStart && clipEnd <= targetEnd) ||
      (clipStart <= targetStart && clipEnd >= targetEnd)
    ) {
      throw new Error(
        `Cannot tile clip: target range overlaps existing clip at ` +
          `position ${clipStart} to ${clipEnd}`,
      );
    }
  }
}

/**
 * Updates properties of existing clips
 * @param {Object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.noteUpdateMode="merge"] - How to handle existing notes: 'replace' or 'merge'
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.start] - Bar|beat position where loop/clip region begins
 * @param {string} [args.length] - Duration in bar:beat format. end = start + length
 * @param {string} [args.firstStart] - Bar|beat position for initial playback start (only needed when different from start)
 * @param {boolean} [args.looping] - Enable looping for the clip
 * @param {string} [args.arrangementStart] - Bar|beat position to move arrangement clip (arrangement clips only)
 * @param {string} [args.arrangementLength] - Bar:beat duration for arrangement span (Phase 1-3: shortening + tiling)
 * @param {number} [args.gain] - Audio clip gain (0-1)
 * @param {number} [args.pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @param {string} [args.warpMode] - Audio clip warp mode: beats, tones, texture, repitch, complex, rex, pro
 * @param {boolean} [args.warping] - Audio clip warping on/off
 * @returns {Object|Array<Object>} Single clip object or array of clip objects
 */
export function updateClip({
  ids,
  notes: notationString,
  noteUpdateMode = "merge",
  name,
  color,
  timeSignature,
  start,
  length,
  firstStart,
  looping,
  arrangementStart,
  arrangementLength,
  gain,
  pitchShift,
  warpMode,
  warping,
  warpOp,
  warpBeatTime,
  warpSampleTime,
  warpDistance,
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

  // Get song time signature for arrangementStart/arrangementLength conversion
  let songTimeSigNumerator, songTimeSigDenominator;
  let arrangementStartBeats = null;
  let arrangementLengthBeats = null;

  if (arrangementStart != null || arrangementLength != null) {
    const liveSet = new LiveAPI("live_set");
    songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    songTimeSigDenominator = liveSet.getProperty("signature_denominator");

    if (arrangementStart != null) {
      arrangementStartBeats = barBeatToAbletonBeats(
        arrangementStart,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    }

    if (arrangementLength != null) {
      arrangementLengthBeats = barBeatDurationToAbletonBeats(
        arrangementLength,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );

      if (arrangementLengthBeats <= 0) {
        throw new Error("arrangementLength must be greater than 0");
      }
    }
  }

  const updatedClips = [];

  // Track which tracks have multiple clips being moved (for overlap warning)
  const tracksWithMovedClips = new Map(); // trackIndex -> count

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

    // Determine current looping state (needed for boundary calculations)
    const isLooping =
      looping != null ? looping : clip.getProperty("looping") > 0;

    // Handle firstStart warning for non-looping clips
    if (firstStart != null && !isLooping) {
      console.error(
        "Warning: firstStart parameter ignored for non-looping clips",
      );
    }

    // Calculate boundary positions
    let startBeats = null;
    let endBeats = null;
    let firstStartBeats = null;
    let startMarkerBeats = null;

    // Convert start to beats if provided
    if (start != null) {
      startBeats = barBeatToAbletonBeats(
        start,
        timeSigNumerator,
        timeSigDenominator,
      );
    }

    // Calculate end from start + length
    if (length != null) {
      const lengthBeats = barBeatDurationToAbletonBeats(
        length,
        timeSigNumerator,
        timeSigDenominator,
      );

      // If start not provided, read current value from clip
      if (startBeats == null) {
        if (isLooping) {
          startBeats = clip.getProperty("loop_start");
        } else {
          // For non-looping clips, derive from end_marker - length
          const currentEndMarker = clip.getProperty("end_marker");
          const currentStartMarker = clip.getProperty("start_marker");
          startBeats = currentEndMarker - lengthBeats;

          // Sanity check: warn if derived start doesn't match start_marker
          if (
            Math.abs(startBeats - currentStartMarker) > 0.001 &&
            currentStartMarker != null
          ) {
            console.error(
              `Warning: Derived start (${startBeats}) differs from current start_marker (${currentStartMarker})`,
            );
          }
        }
      }

      endBeats = startBeats + lengthBeats;
    }

    // Handle firstStart for looping clips
    if (firstStart != null && isLooping) {
      firstStartBeats = barBeatToAbletonBeats(
        firstStart,
        timeSigNumerator,
        timeSigDenominator,
      );
    }

    // Determine start_marker value
    if (firstStartBeats != null) {
      // firstStart takes precedence
      startMarkerBeats = firstStartBeats;
    } else if (startBeats != null && !isLooping) {
      // For non-looping clips, start_marker = start
      startMarkerBeats = startBeats;
    } else if (startBeats != null && isLooping) {
      // For looping clips without firstStart, start_marker = start
      startMarkerBeats = startBeats;
    }

    // Determine if we need to set end before start to avoid "LoopStart behind LoopEnd" error
    let setEndFirst = false;
    if (isLooping && startBeats != null && endBeats != null) {
      const currentLoopEnd = clip.getProperty("loop_end");
      // If new start would be beyond current end, set end first
      if (startBeats > currentLoopEnd) {
        setEndFirst = true;
      }
    }

    // Set properties based on looping state and ordering requirements
    const propsToSet = {
      name: name,
      color: color,
      signature_numerator: timeSignature != null ? timeSigNumerator : null,
      signature_denominator: timeSignature != null ? timeSigDenominator : null,
      start_marker: startMarkerBeats,
      looping: looping,
    };

    // Set loop properties for looping clips (order matters!)
    if (isLooping || looping == null) {
      if (setEndFirst && endBeats != null && looping !== false) {
        // Set end first to avoid "LoopStart behind LoopEnd" error
        propsToSet.loop_end = endBeats;
      }
      if (startBeats != null && looping !== false) {
        propsToSet.loop_start = startBeats;
      }
      if (!setEndFirst && endBeats != null && looping !== false) {
        // Set end after start in normal case
        propsToSet.loop_end = endBeats;
      }
    }

    // Set end_marker for non-looping clips
    if (!isLooping || looping === false) {
      if (endBeats != null) {
        propsToSet.end_marker = endBeats;
      }
    }

    clip.setAll(propsToSet);

    // Audio-specific parameters (only for audio clips)
    const isAudioClip = clip.getProperty("is_audio_clip") > 0;
    if (isAudioClip) {
      if (gain !== undefined) {
        clip.set("gain", gain);
      }

      if (pitchShift !== undefined) {
        const pitchCoarse = Math.floor(pitchShift);
        const pitchFine = Math.round((pitchShift - pitchCoarse) * 100);
        clip.set("pitch_coarse", pitchCoarse);
        clip.set("pitch_fine", pitchFine);
      }

      if (warpMode !== undefined) {
        const warpModeValue = {
          [WARP_MODE.BEATS]: LIVE_API_WARP_MODE_BEATS,
          [WARP_MODE.TONES]: LIVE_API_WARP_MODE_TONES,
          [WARP_MODE.TEXTURE]: LIVE_API_WARP_MODE_TEXTURE,
          [WARP_MODE.REPITCH]: LIVE_API_WARP_MODE_REPITCH,
          [WARP_MODE.COMPLEX]: LIVE_API_WARP_MODE_COMPLEX,
          [WARP_MODE.REX]: LIVE_API_WARP_MODE_REX,
          [WARP_MODE.PRO]: LIVE_API_WARP_MODE_PRO,
        }[warpMode];
        if (warpModeValue !== undefined) {
          clip.set("warp_mode", warpModeValue);
        }
      }

      if (warping !== undefined) {
        clip.set("warping", warping ? 1 : 0);
      }
    }

    if (notationString != null) {
      let combinedNotationString = notationString;

      if (noteUpdateMode === "merge") {
        // In merge mode, prepend existing notes as bar|beat notation
        const existingNotesResult = JSON.parse(
          clip.call("get_notes_extended", 0, 128, 0, MAX_CLIP_BEATS),
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
      clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);
      if (notes.length > 0) {
        clip.call("add_new_notes", { notes });
      }

      // Query actual note count within playback region (consistent with read-clip)
      const lengthBeats = clip.getProperty("length");
      const actualNotesResult = JSON.parse(
        clip.call("get_notes_extended", 0, 128, 0, lengthBeats),
      );
      finalNoteCount = actualNotesResult?.notes?.length || 0;
    }

    // Handle warp marker operations (audio clips only)
    if (warpOp != null) {
      // Validate audio clip
      const hasAudioFile = clip.getProperty("file_path") != null;
      if (!hasAudioFile) {
        throw new Error(
          `Warp markers only available on audio clips (clip ${clip.id} is MIDI or empty)`,
        );
      }

      // Validate required parameters per operation
      if (warpBeatTime == null) {
        throw new Error(`warpBeatTime required for ${warpOp} operation`);
      }

      switch (warpOp) {
        case "add": {
          // Add warp marker with optional sample time
          const args =
            warpSampleTime != null
              ? { beat_time: warpBeatTime, sample_time: warpSampleTime }
              : { beat_time: warpBeatTime };

          clip.call("add_warp_marker", args);
          break;
        }

        case "move": {
          if (warpDistance == null) {
            throw new Error("warpDistance required for move operation");
          }

          clip.call("move_warp_marker", warpBeatTime, warpDistance);
          break;
        }

        case "remove": {
          clip.call("remove_warp_marker", warpBeatTime);
          break;
        }
      }
    }

    // Handle arrangementLength (Phase 1: shortening only)
    if (arrangementLengthBeats != null) {
      const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;

      if (!isArrangementClip) {
        console.error(
          `Warning: arrangementLength parameter ignored for session clip (id ${clip.id})`,
        );
      } else {
        // Get current clip dimensions
        const currentStartTime = clip.getProperty("start_time");
        let currentEndTime = clip.getProperty("end_time");
        const currentArrangementLength = currentEndTime - currentStartTime;

        // Check if shortening, lengthening, or same
        if (arrangementLengthBeats > currentArrangementLength) {
          // Lengthening: Phases 2-3 (clean tiling)
          // Check firstStart condition (must equal start or not be provided)
          let firstStartMatches = true;
          if (firstStart != null) {
            const clipStart = clip.getProperty("start_marker");
            const firstStartBeats = barBeatToAbletonBeats(
              firstStart,
              songTimeSigNumerator,
              songTimeSigDenominator,
            );
            firstStartMatches = Math.abs(firstStartBeats - clipStart) < 0.001;
          }

          if (!firstStartMatches) {
            throw new Error(
              "Cannot lengthen clip: firstStart must equal start. " +
                "Phase 5 (firstStart != start) not yet implemented.",
            );
          }

          const clipLoopStart = clip.getProperty("loop_start");
          const clipLoopEnd = clip.getProperty("loop_end");
          const clipLength = clipLoopEnd - clipLoopStart;

          // Phases 2-3: Clean Tiling
          const trackIndex = clip.trackIndex;
          if (trackIndex == null) {
            throw new Error(
              `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
            );
          }

          const track = new LiveAPI(`live_set tracks ${trackIndex}`);
          const liveSet = new LiveAPI("live_set");

          // Calculate holding area once for reuse
          const holdingArea = calculateHoldingArea(liveSet);

          // Phase 3: If current arrangement length > clip content length,
          // first shorten to match content before tiling
          if (currentArrangementLength > clipLength) {
            const newEndTime = currentStartTime + clipLength;
            const tempClipLength = currentEndTime - newEndTime;

            // Critical validation: temp clip must not extend past original end_time
            if (newEndTime + tempClipLength !== currentEndTime) {
              throw new Error(
                `Phase 3 shortening validation failed: calculation error in temp clip bounds`,
              );
            }

            // Create temp clip to truncate
            const tempClipPath = track.call(
              "create_midi_clip",
              newEndTime,
              tempClipLength,
            );
            const tempClip = LiveAPI.from(tempClipPath);

            // Delete temp clip - this leaves target clip shortened
            track.call("delete_clip", `id ${tempClip.id}`);

            // Update currentEndTime after shortening
            currentEndTime = currentStartTime + clipLength;
          }

          // Calculate tiling requirements based on desired length
          // Phase 2/3: Tile the (now properly-sized) clip
          const fullTiles = Math.floor(arrangementLengthBeats / clipLength);
          const remainder = arrangementLengthBeats % clipLength;

          // Validate target range is clear (exclude source clip)
          const targetStart = currentStartTime;
          const targetEnd = currentStartTime + arrangementLengthBeats;
          checkAdjacentClipConflict(track, targetStart, targetEnd, clip.id);

          // Create full tiles (first tile is existing clip, so start at i=1)
          let lastClipEnd = currentEndTime;
          for (let i = 1; i < fullTiles; i++) {
            const tilePosition = lastClipEnd;
            const result = track.call(
              "duplicate_clip_to_arrangement",
              `id ${clip.id}`,
              tilePosition,
            );
            const newClip = LiveAPI.from(result);
            lastClipEnd = newClip.getProperty("end_time");
          }

          // Handle partial final tile if remainder exists
          if (remainder > 0.001) {
            // Duplicate source to holding area
            const holdingResult = track.call(
              "duplicate_clip_to_arrangement",
              `id ${clip.id}`,
              holdingArea.startBeats,
            );
            const holdingClip = LiveAPI.from(holdingResult);

            // Shorten holding clip to remainder (Phase 1 pattern)
            const holdingClipEnd = holdingClip.getProperty("end_time");
            const newHoldingEnd = holdingArea.startBeats + remainder;
            const tempLength = holdingClipEnd - newHoldingEnd;

            const tempResult = track.call(
              "create_midi_clip",
              newHoldingEnd,
              tempLength,
            );
            const tempClip = LiveAPI.from(tempResult);
            track.call("delete_clip", `id ${tempClip.id}`);

            // Duplicate shortened clip to final position
            track.call(
              "duplicate_clip_to_arrangement",
              `id ${holdingClip.id}`,
              lastClipEnd,
            );

            // Clean up holding area immediately
            track.call("delete_clip", `id ${holdingClip.id}`);
          }
        } else if (arrangementLengthBeats < currentArrangementLength) {
          // Shortening: Use temp clip overlay pattern
          const newEndTime = currentStartTime + arrangementLengthBeats;
          const tempClipLength = currentEndTime - newEndTime;

          // Critical validation: temp clip must not extend past original end_time
          if (newEndTime + tempClipLength !== currentEndTime) {
            throw new Error(
              `Internal error: temp clip boundary calculation failed for clip ${clip.id}`,
            );
          }

          // Get track
          const trackIndex = clip.trackIndex;
          if (trackIndex == null) {
            throw new Error(
              `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
            );
          }

          const track = new LiveAPI(`live_set tracks ${trackIndex}`);

          // Create temporary clip to truncate target
          const tempClipResult = track.call(
            "create_midi_clip",
            newEndTime,
            tempClipLength,
          );
          const tempClip = LiveAPI.from(tempClipResult);

          // Delete temporary clip (target is now shortened)
          track.call("delete_clip", `id ${tempClip.id}`);
        }
        // else: same length, no-op
      }
    }

    // Handle arrangementStart (move clip) after all property updates
    let finalClipId = clip.id;
    if (arrangementStartBeats != null) {
      const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;

      if (!isArrangementClip) {
        console.error(
          `Warning: arrangementStart parameter ignored for session clip (id ${clip.id})`,
        );
      } else {
        // Get track and duplicate clip to new position
        const trackIndex = clip.trackIndex;
        if (trackIndex == null) {
          throw new Error(
            `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
          );
        }

        const track = new LiveAPI(`live_set tracks ${trackIndex}`);

        // Track clips being moved to same track
        const moveCount = (tracksWithMovedClips.get(trackIndex) || 0) + 1;
        tracksWithMovedClips.set(trackIndex, moveCount);

        const newClipResult = track.call(
          "duplicate_clip_to_arrangement",
          `id ${clip.id}`,
          arrangementStartBeats,
        );
        const newClip = LiveAPI.from(newClipResult);

        // Delete original clip
        track.call("delete_clip", `id ${clip.id}`);

        // Update clip ID to the new clip
        finalClipId = newClip.id;
      }
    }

    // Build optimistic result object
    const clipResult = {
      id: finalClipId,
    };

    // Only include noteCount if notes were modified
    if (finalNoteCount != null) {
      clipResult.noteCount = finalNoteCount;
    }

    updatedClips.push(clipResult);
  }

  // Emit warning if multiple clips from same track were moved to same position
  if (arrangementStartBeats != null) {
    for (const [trackIndex, count] of tracksWithMovedClips.entries()) {
      if (count > 1) {
        console.error(
          `Warning: ${count} clips on track ${trackIndex} moved to the same position - later clips will overwrite earlier ones`,
        );
      }
    }
  }

  // Return single object if one valid result, array for multiple results or empty array for none
  if (updatedClips.length === 0) {
    return [];
  }
  return updatedClips.length === 1 ? updatedClips[0] : updatedClips;
}
