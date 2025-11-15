import { formatNotation } from "../../notation//barbeat/barbeat-format-notation.js";
import { interpretNotation } from "../../notation//barbeat/barbeat-interpreter.js";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import * as console from "../../shared/v8-max-console.js";
import {
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_PRO,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_TONES,
  MAX_CLIP_BEATS,
  WARP_MODE,
} from "../constants.js";
import {
  createAudioClipInSession,
  tileClipToRange,
} from "../shared/arrangement-tiling.js";
import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";

/**
 * Get the actual content end position by examining all notes in a clip.
 * This is needed for unlooped clips where end_marker is unreliable.
 * @param {LiveAPI} clip - The clip to analyze
 * @returns {number} The end position of the last note in beats, or 0 if no notes
 */
function getActualContentEnd(clip) {
  try {
    // For unlooped clips, we need to check ALL notes, not just up to current length
    // Use MAX_CLIP_BEATS to ensure we get all possible notes
    const notesDictionary = clip.call(
      "get_notes_extended",
      0,
      128,
      0,
      MAX_CLIP_BEATS,
    );
    const notes = JSON.parse(notesDictionary).notes;

    if (!notes || notes.length === 0) {
      return 0; // No notes = no content
    }

    // Find the maximum end position (start_time + duration)
    return Math.max(...notes.map((note) => note.start_time + note.duration));
  } catch (error) {
    console.error(
      `Warning: Failed to get notes for clip ${clip.id}: ${error.message}`,
    );
    return 0; // Fall back to treating as no content
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
 * @param {string} [args.arrangementLength] - Bar:beat duration for arrangement span (supports shortening, hidden content exposure, and tiling)
 * @param {number} [args.gain] - Audio clip gain (0-1)
 * @param {number} [args.pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @param {string} [args.warpMode] - Audio clip warp mode: beats, tones, texture, repitch, complex, rex, pro
 * @param {boolean} [args.warping] - Audio clip warping on/off
 * @returns {Object|Array<Object>} Single clip object or array of clip objects
 */
export function updateClip(
  {
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
  } = {},
  context = {
    holdingAreaStartBeats: 40000,
  },
) {
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

    // Handle arrangementLength (shortening, hidden content exposure, and tiling)
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
          // Lengthening via tiling or hidden content exposure

          // Check if clip is looped to determine behavior
          const isLooping = clip.getProperty("looping") > 0;
          const clipLoopStart = clip.getProperty("loop_start");
          const clipLoopEnd = clip.getProperty("loop_end");
          const clipStartMarker = clip.getProperty("start_marker");
          const clipEndMarker = clip.getProperty("end_marker");

          // For unlooped clips, use end_marker - start_marker (actual playback length)
          // For looped clips, use loop region
          const clipLength = isLooping
            ? clipLoopEnd - clipLoopStart
            : clipEndMarker - clipStartMarker;

          // Set up for lengthening operation
          const trackIndex = clip.trackIndex;
          if (trackIndex == null) {
            throw new Error(
              `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
            );
          }

          const track = new LiveAPI(`live_set tracks ${trackIndex}`);

          // Handle unlooped clips separately from looped clips
          if (!isLooping) {
            // For unlooped clips, we need different behavior than looping clips
            const spaceNeeded =
              arrangementLengthBeats - currentArrangementLength;

            // For MIDI clips, determine actual content extent by examining notes
            // For audio clips, we can't examine content, so handle differently
            if (!isAudioClip) {
              // MIDI clip: Get actual content end from notes
              const actualContentEnd = getActualContentEnd(clip);

              // For unlooped clips, the visible content end in the clip is:
              // start_marker + arrangementLength (not just arrangementLength)
              const visibleContentEnd =
                clipStartMarker + currentArrangementLength;

              console.error(
                `DEBUG unlooped MIDI: actualContentEnd=${actualContentEnd}, clipStartMarker=${clipStartMarker}, visibleContentEnd=${visibleContentEnd}`,
              );

              // Use threshold comparison to avoid floating point precision issues
              const EPSILON = 0.001;
              if (actualContentEnd - visibleContentEnd > EPSILON) {
                // Case: Hidden content exists - reveal it via tiling
                const revealLength = Math.min(
                  actualContentEnd - clipStartMarker,
                  arrangementLengthBeats,
                );
                const remainingToReveal =
                  revealLength - currentArrangementLength;

                console.error(
                  `DEBUG unlooped reveal: revealing ${remainingToReveal} beats of hidden content`,
                );

                // For unlooped clips, we need to manually set start_marker and end_marker
                // First, set the source clip's end_marker to the actual content end
                // This allows the tiled clip to access all the content
                clip.set("end_marker", actualContentEnd);

                // Duplicate the clip to the position where hidden content starts
                const duplicateResult = track.call(
                  "duplicate_clip_to_arrangement",
                  `id ${clip.id}`,
                  currentEndTime,
                );
                const revealedClip = LiveAPI.from(duplicateResult);

                // Calculate the markers for the revealed clip
                const newStartMarker = visibleContentEnd; // Where hidden content starts
                const newEndMarker = newStartMarker + remainingToReveal;

                // Workaround for Live API bug: setting start_marker on unlooped clips doesn't work
                // Solution: enable looping, set end_marker first, then start_marker, then disable looping
                revealedClip.set("looping", 1);
                revealedClip.set("end_marker", newEndMarker); // Set end_marker FIRST
                revealedClip.set("start_marker", newStartMarker); // Then start_marker
                revealedClip.set("looping", 0);

                console.error(
                  `DEBUG unlooped: set revealed clip markers: start_marker=${newStartMarker}, end_marker=${newEndMarker}`,
                );

                updatedClips.push({ id: clip.id });
                updatedClips.push({ id: revealedClip.id });

                // Check if we still need more space after revealing all content
                const remainingSpace = arrangementLengthBeats - revealLength;
                if (remainingSpace > 0) {
                  // Create empty MIDI clip(s) for the overflow
                  const emptyStartTime = currentStartTime + revealLength;
                  console.error(
                    `DEBUG creating empty MIDI clip after reveal: start=${emptyStartTime}, length=${remainingSpace}`,
                  );

                  const emptyClipResult = track.call(
                    "create_midi_clip",
                    emptyStartTime,
                    remainingSpace,
                  );
                  const emptyClip = LiveAPI.from(emptyClipResult);
                  updatedClips.push({ id: emptyClip.id });
                }
                continue;
              }

              // Case: No hidden content (all content already visible)
              // MIDI: Create empty clip(s) to fill the requested space
              console.error(
                `DEBUG creating empty MIDI clip: start=${currentEndTime}, length=${spaceNeeded}`,
              );

              const emptyClipResult = track.call(
                "create_midi_clip",
                currentEndTime,
                spaceNeeded,
              );
              const emptyClip = LiveAPI.from(emptyClipResult);
              updatedClips.push({ id: clip.id });
              updatedClips.push({ id: emptyClip.id });
              continue;
            }

            // Audio clip: Cannot extend beyond clip boundaries
            // Use end_marker as best guess (even though it may be unreliable)
            const clipLength = clipEndMarker - clipStartMarker;

            if (currentArrangementLength < clipLength) {
              // Try to reveal hidden audio content via tiling
              const revealLength = Math.min(clipLength, arrangementLengthBeats);
              const remainingToReveal = revealLength - currentArrangementLength;

              console.error(
                `DEBUG unlooped audio reveal: revealing ${remainingToReveal} beats`,
              );

              const tiledClips = tileClipToRange(
                clip,
                track,
                currentEndTime,
                remainingToReveal,
                context.holdingAreaStartBeats,
                context,
                {
                  adjustPreRoll: false,
                  startOffset: currentArrangementLength,
                  tileLength: currentArrangementLength,
                },
              );

              updatedClips.push({ id: clip.id });
              updatedClips.push(...tiledClips);
              continue;
            }

            // Audio: All content visible, cannot extend further - do nothing
            console.error(
              `DEBUG unlooped audio: cannot extend beyond clip length (${clipLength} beats)`,
            );
            updatedClips.push({ id: clip.id });
            continue;
          }

          // Branch: expose hidden content vs tiling (looped clips only)
          if (arrangementLengthBeats < clipLength) {
            // Expose hidden content by tiling with start_marker offsets
            // This preserves automation envelopes while revealing the correct content
            const clipStartMarker = clip.getProperty("start_marker");
            const currentOffset = clipStartMarker - clipLoopStart;

            // Keep the source clip and tile AFTER it
            const remainingLength =
              arrangementLengthBeats - currentArrangementLength;
            console.error(
              `DEBUG update-clip scenario A: arrangementLengthBeats=${arrangementLengthBeats}, currentArrangementLength=${currentArrangementLength}, remainingLength=${remainingLength}`,
            );
            const tiledClips = tileClipToRange(
              clip,
              track,
              currentEndTime, // Start tiling after the existing clip
              remainingLength, // Only tile the remaining space
              context.holdingAreaStartBeats,
              context,
              {
                adjustPreRoll: false,
                startOffset: currentOffset + currentArrangementLength,
                tileLength: currentArrangementLength,
              },
            );

            // Add original clip and tiled clips to results
            updatedClips.push({ id: clip.id });
            updatedClips.push(...tiledClips);
            continue;
          } else {
            // Lengthening via clean tiling
            // The desired length requires tiling the clip content

            // Calculate total content length (includes pre-roll if firstStart < start)
            const clipStartMarker = clip.getProperty("start_marker");
            const totalContentLength = clipLoopEnd - clipStartMarker;

            // If clip not showing full content, tile with start_marker offsets
            if (currentArrangementLength < totalContentLength) {
              // Preserve envelopes by tiling existing clip with proper start_marker values
              // Keep the source clip and tile AFTER it
              const remainingLength =
                arrangementLengthBeats - currentArrangementLength;
              console.error(
                `DEBUG update-clip scenario B: arrangementLengthBeats=${arrangementLengthBeats}, currentArrangementLength=${currentArrangementLength}, totalContentLength=${totalContentLength}, remainingLength=${remainingLength}`,
              );
              const tiledClips = tileClipToRange(
                clip,
                track,
                currentEndTime, // Start tiling after the existing clip
                remainingLength, // Only tile the remaining space
                context.holdingAreaStartBeats,
                context,
                {
                  adjustPreRoll: true,
                  startOffset: currentArrangementLength,
                  tileLength: currentArrangementLength,
                },
              );

              // Add original clip and tiled clips to results
              updatedClips.push({ id: clip.id });
              updatedClips.push(...tiledClips);
              continue;
            }

            // If current arrangement length > total content length,
            // first shorten to match content (including pre-roll) before tiling
            if (currentArrangementLength > totalContentLength) {
              const newEndTime = currentStartTime + totalContentLength;
              const tempClipLength = currentEndTime - newEndTime;

              // Critical validation: temp clip must not extend past original end_time
              if (newEndTime + tempClipLength !== currentEndTime) {
                throw new Error(
                  `Shortening validation failed: calculation error in temp clip bounds`,
                );
              }

              // Create temp clip to truncate (use appropriate method for clip type)
              if (isAudioClip) {
                // Create audio clip in session with exact length
                const { clip: sessionClip, slot } = createAudioClipInSession(
                  track,
                  tempClipLength,
                  context.silenceWavPath,
                );

                // Duplicate to arrangement at the truncation position
                const tempResult = track.call(
                  "duplicate_clip_to_arrangement",
                  `id ${sessionClip.id}`,
                  newEndTime,
                );
                const tempClip = LiveAPI.from(tempResult);

                // Delete both session and arrangement clips
                slot.call("delete_clip");
                track.call("delete_clip", `id ${tempClip.id}`);
              } else {
                // MIDI clips can be created directly in arrangement
                const tempClipPath = track.call(
                  "create_midi_clip",
                  newEndTime,
                  tempClipLength,
                );
                const tempClip = LiveAPI.from(tempClipPath);
                track.call("delete_clip", `id ${tempClip.id}`);
              }

              // Update currentEndTime after shortening
              currentEndTime = currentStartTime + totalContentLength;
            }

            // Calculate tiling requirements based on desired length
            // Tile the (now properly-sized) clip using shared helper
            const firstTileLength = currentEndTime - currentStartTime;
            const remainingSpace = arrangementLengthBeats - firstTileLength;

            const tiledClips = tileClipToRange(
              clip,
              track,
              currentEndTime,
              remainingSpace,
              context.holdingAreaStartBeats,
              context,
              { adjustPreRoll: true, tileLength: firstTileLength },
            );

            // Add original clip and tiled clips to results
            updatedClips.push({ id: clip.id });
            updatedClips.push(...tiledClips);
            continue;
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

          // Create temporary clip to truncate target (use appropriate method for clip type)
          if (isAudioClip) {
            // Create audio clip in session with exact length
            const { clip: sessionClip, slot } = createAudioClipInSession(
              track,
              tempClipLength,
              context.silenceWavPath,
            );

            // Duplicate to arrangement at the truncation position
            const tempResult = track.call(
              "duplicate_clip_to_arrangement",
              `id ${sessionClip.id}`,
              newEndTime,
            );
            const tempClip = LiveAPI.from(tempResult);

            // CRITICAL: Re-apply warping and looping to arrangement clip
            // (duplicate_clip_to_arrangement doesn't preserve these settings)
            tempClip.set("warping", 1);
            tempClip.set("looping", 1);
            tempClip.set("loop_end", tempClipLength);

            // Delete both session and arrangement clips
            slot.call("delete_clip");
            track.call("delete_clip", `id ${tempClip.id}`);
          } else {
            // MIDI clips can be created directly in arrangement
            const tempClipResult = track.call(
              "create_midi_clip",
              newEndTime,
              tempClipLength,
            );
            const tempClip = LiveAPI.from(tempClipResult);
            track.call("delete_clip", `id ${tempClip.id}`);
          }
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
