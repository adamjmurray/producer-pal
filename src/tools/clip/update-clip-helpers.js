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
import { createAudioClipInSession } from "../shared/arrangement-tiling.js";

/**
 * Get the actual content end position by examining all notes in a clip.
 * This is needed for unlooped clips where end_marker is unreliable.
 * @param {LiveAPI} clip - The clip to analyze
 * @returns {number} The end position of the last note in beats, or 0 if no notes
 */
export function getActualContentEnd(clip) {
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
 * Get the actual audio content end position for unlooped audio clips.
 * For unwarped clips: calculates from sample_length, sample_rate, and tempo.
 * For warped clips: uses warp markers (second-to-last marker).
 * @param {LiveAPI} clip - The audio clip to analyze
 * @returns {number} The end position of the audio in beats
 */
export function getActualAudioEnd(clip) {
  try {
    const isWarped = clip.getProperty("warping") === 1;

    if (!isWarped) {
      // Unwarped clip: calculate from sample properties and tempo
      const sampleLength = clip.getProperty("sample_length");
      const sampleRate = clip.getProperty("sample_rate");

      if (!sampleLength || !sampleRate) {
        console.error(
          `Warning: Missing sample properties for unwarped clip ${clip.id}`,
        );
        return 0;
      }

      // Get tempo from live_set
      const liveSet = new LiveAPI("live_set");
      const tempo = liveSet.getProperty("tempo");

      if (!tempo) {
        console.error(`Warning: Could not get tempo from live_set`);
        return 0;
      }

      // Calculate audio duration in beats
      const durationSeconds = sampleLength / sampleRate;
      const beatsPerSecond = tempo / 60;
      const durationBeats = durationSeconds * beatsPerSecond;
      return durationBeats;
    } else {
      // Warped clip: use warp markers
      const warpMarkersJson = clip.getProperty("warp_markers");
      const warpData = JSON.parse(warpMarkersJson);

      if (!warpData.warp_markers || warpData.warp_markers.length === 0) {
        return 0; // No warp markers = no content info available
      }

      const markers = warpData.warp_markers;

      // Use second-to-last warp marker (last one is often beyond actual content)
      if (markers.length < 2) {
        // If only one marker, use it
        return markers[0].beat_time;
      }

      // Use second-to-last marker to get actual audio end
      const secondToLast = markers[markers.length - 2];
      return secondToLast.beat_time;
    }
  } catch (error) {
    console.error(
      `Warning: Failed to get actual audio end for clip ${clip.id}: ${error.message}`,
    );
    return 0; // Fall back to treating as no content
  }
}

/**
 * Reveals hidden content in an unwarped audio clip using session holding area technique.
 * Creates a temp warped/looped clip, sets markers, then restores unwarp/unloop state.
 * ONLY used for unlooped + unwarped + audio clips with hidden content.
 *
 * @param {LiveAPI} sourceClip - The source clip to get audio file from
 * @param {LiveAPI} track - The track to work with
 * @param {number} newStartMarker - Start marker for revealed content
 * @param {number} newEndMarker - End marker for revealed content
 * @param {number} targetPosition - Where to place revealed clip in arrangement
 * @param {Object} context - Context object with paths
 * @returns {LiveAPI} The revealed clip in arrangement
 */
export function revealUnwarpedAudioContent(
  sourceClip,
  track,
  newStartMarker,
  newEndMarker,
  targetPosition,
  _context,
) {
  // 1. Get audio file path
  const filePath = sourceClip.getProperty("file_path");

  console.error(
    `WARNING: Extending unwarped audio clip requires recreating the extended portion due to Live API limitations. Envelopes will be lost in the revealed section.`,
  );

  // 2. Create temp clip in session holding area from that file
  // IMPORTANT: Set length to newEndMarker (not targetLength) to include all content from start of file
  const { clip: tempClip, slot: tempSlot } = createAudioClipInSession(
    track,
    newEndMarker, // Full length to include all content up to reveal end
    filePath, // Use actual audio file instead of silence.wav
  );

  // 3. Set markers in BEATS while warped and looped
  // (start_marker can only be set when looping AND warping are enabled)
  // start_marker hides content before the revealed portion
  tempClip.set("loop_end", newEndMarker);
  tempClip.set("loop_start", newStartMarker);
  tempClip.set("end_marker", newEndMarker);
  tempClip.set("start_marker", newStartMarker);

  // 4. Duplicate to arrangement WHILE STILL WARPED (this preserves markers!)
  const result = track.call(
    "duplicate_clip_to_arrangement",
    `id ${tempClip.id}`,
    targetPosition,
  );
  const revealedClip = LiveAPI.from(result);

  // 5. NOW unwarp and unloop the ARRANGEMENT clip (markers auto-convert from beats to seconds)
  revealedClip.set("warping", 0);
  revealedClip.set("looping", 0);

  // 6. Shorten the clip to only show the revealed portion
  // The clip currently shows from start_marker to end of audio
  // We want it to only show from newStartMarker to newEndMarker (in beats, now converted to seconds)
  const revealedClipEndTime = revealedClip.getProperty("end_time");
  const targetLengthBeats = newEndMarker - newStartMarker;

  // Use the temp clip shortening technique to trim the clip to the correct length
  const { clip: tempShortenerClip, slot: tempShortenerSlot } =
    createAudioClipInSession(
      track,
      targetLengthBeats,
      sourceClip.getProperty("file_path"),
    );

  const tempShortenerResult = track.call(
    "duplicate_clip_to_arrangement",
    `id ${tempShortenerClip.id}`,
    revealedClipEndTime,
  );
  const tempShortener = LiveAPI.from(tempShortenerResult);

  // Clean up temp shortener clips
  tempShortenerSlot.call("delete_clip");
  track.call("delete_clip", `id ${tempShortener.id}`);

  // 7. Clean up temp clip from session
  tempSlot.call("delete_clip");

  return revealedClip;
}

/**
 * Sets audio-specific parameters on a clip
 * @param {LiveAPI} clip - The audio clip
 * @param {number} [gain] - Audio clip gain (0-1)
 * @param {number} [pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @param {string} [warpMode] - Audio clip warp mode
 * @param {boolean} [warping] - Audio clip warping on/off
 */
export function setAudioParameters(
  clip,
  { gain, pitchShift, warpMode, warping },
) {
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

/**
 * Handles warp marker operations on a clip
 * @param {LiveAPI} clip - The audio clip
 * @param {string} warpOp - Operation: add, move, or remove
 * @param {number} warpBeatTime - Beat time for the warp marker
 * @param {number} [warpSampleTime] - Sample time (for add operation)
 * @param {number} [warpDistance] - Distance to move (for move operation)
 */
export function handleWarpMarkerOperation(
  clip,
  warpOp,
  warpBeatTime,
  warpSampleTime,
  warpDistance,
) {
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
