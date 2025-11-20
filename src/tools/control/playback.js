import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import { validateIdType, validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds } from "../shared/utils.js";
import { select } from "./select.js";

/**
 * Unified control for all playback functionality in both Arrangement and Session views.
 * IMPORTANT: Tracks can either follow the Arrangement timeline or play Session clips independently.
 * When Session clips are launched, those tracks stop following the Arrangement until explicitly told to return.
 * @param {object} args - The parameters
 * @param {string} args.action - Action to perform
 * @param {string} [args.startTime] - Position in bar|beat format to start playback from in the arrangement
 * @param {boolean} [args.loop] - Enable/disable arrangement loop
 * @param {string} [args.loopStart] - Loop start position in bar|beat format in the arrangement
 * @param {string} [args.loopEnd] - Loop end position in bar|beat format in the arrangement
 * @param {boolean} [args.autoFollow=true] - For 'play-arrangement' action: whether all tracks should automatically follow the arrangement
 * @param {string} [args.sceneId] - Scene ID for Session view operations (puts tracks into non-following state)
 * @param {string} [args.clipIds] - Comma-separated clip IDs for Session view operations
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view for the operation
 * @param _context
 * @returns {object} Result with transport state
 */
export function playback(
  {
    action,
    startTime,
    loop,
    loopStart,
    loopEnd,
    autoFollow = true,
    sceneId,
    clipIds,
    switchView,
  } = {},
  _context = {},
) {
  if (!action) {
    throw new Error("playback failed: action is required");
  }
  const liveSet = new LiveAPI("live_set");

  // Get song time signature for bar|beat conversions
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  // Convert bar|beat inputs to Ableton beats
  let startTimeBeats, loopStartBeats, loopEndBeats;

  if (startTime != null) {
    startTimeBeats = barBeatToAbletonBeats(
      startTime,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
    liveSet.set("start_time", startTimeBeats);
  }
  if (loop != null) {
    liveSet.set("loop", loop);
  }
  if (loopStart != null) {
    loopStartBeats = barBeatToAbletonBeats(
      loopStart,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
    liveSet.set("loop_start", loopStartBeats);
  }
  if (loopEnd != null) {
    loopEndBeats = barBeatToAbletonBeats(
      loopEnd,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
    // Live API uses loop_length, not loop_end, so we need to calculate the length
    const actualLoopStartBeats =
      loopStartBeats ?? liveSet.getProperty("loop_start");
    const loopLengthBeats = loopEndBeats - actualLoopStartBeats;
    liveSet.set("loop_length", loopLengthBeats);
  }

  // Default result values that will be overridden by specific actions
  // (for optimistic results to avoid a sleep() for playback state updates)
  let isPlaying = liveSet.getProperty("is_playing") > 0;
  let currentTimeBeats = liveSet.getProperty("current_song_time");

  switch (action) {
    case "play-arrangement":
      if (startTime == null) {
        liveSet.set("start_time", 0);
        startTimeBeats = 0;
      }

      // Handle autoFollow for arrangement playback
      if (autoFollow) {
        liveSet.set("back_to_arranger", 0);
      }

      liveSet.call("start_playing");

      isPlaying = true;
      currentTimeBeats = startTimeBeats ?? 0;
      break;

    case "update-arrangement":
      // No playback state change, just the loop and follow settings above
      break;

    case "play-scene": {
      if (sceneId == null) {
        throw new Error(
          `playback failed: sceneId is required for action "play-scene"`,
        );
      }
      const scene = validateIdType(sceneId, "scene", "playback");

      scene.call("fire");

      isPlaying = true;
      break;
    }

    case "play-session-clips": {
      if (!clipIds) {
        throw new Error(
          `playback failed: clipIds is required for action "play-session-clips"`,
        );
      }

      const clipIdList = parseCommaSeparatedIds(clipIds);
      const clips = validateIdTypes(clipIdList, "clip", "playback", {
        skipInvalid: true,
      });

      for (const clip of clips) {
        // For clips, we need to fire the clip slot, not the clip itself
        // Extract track index and scene index from clip path or properties
        const trackIndex = clip.trackIndex;
        const sceneIndex = clip.sceneIndex;
        if (trackIndex == null || sceneIndex == null) {
          throw new Error(
            `playback play-session-clips action failed: could not determine track/scene for clipId=${clip.id}`,
          );
        }
        const clipSlot = new LiveAPI(
          `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
        );
        if (!clipSlot.exists()) {
          throw new Error(
            `playback play-session-clips action failed: clip slot for clipId=${clip.id.replace(/^id /, "")} does not exist`,
          );
        }
        clipSlot.call("fire");
      }

      // Fix launch quantization: when playing multiple clips, stop and restart transport
      // to ensure in-sync playback (clips fired after the first are subject to quantization)
      if (clips.length > 1) {
        liveSet.call("stop_playing");
        liveSet.call("start_playing");
      }

      isPlaying = true;
      break;
    }

    case "stop-session-clips": {
      if (!clipIds) {
        throw new Error(
          `playback failed: clipIds is required for action "stop-session-clips"`,
        );
      }

      const stopClipIdList = parseCommaSeparatedIds(clipIds);
      const stopClips = validateIdTypes(stopClipIdList, "clip", "playback", {
        skipInvalid: true,
      });
      const tracksToStop = new Set();

      for (const clip of stopClips) {
        // Extract track index from clip and add to set to avoid duplicate calls
        const trackIndex = clip.trackIndex;
        if (trackIndex == null) {
          throw new Error(
            `playback stop-session-clips action failed: could not determine track for clipId=${clip.id}`,
          );
        }
        const trackPath = `live_set tracks ${trackIndex}`;
        tracksToStop.add(trackPath);
      }

      for (const trackPath of tracksToStop) {
        const track = new LiveAPI(trackPath);
        if (!track.exists()) {
          throw new Error(
            `playback stop-session-clips action failed: track for clip path does not exist`,
          );
        }
        track.call("stop_all_clips");
      }
      // this doesn't affect the isPlaying state
      break;
    }

    case "stop-all-session-clips":
      liveSet.call("stop_all_clips");
      // the transport/arrangement might still be playing so don't update isPlaying
      break;

    case "stop":
      liveSet.call("stop_playing");
      liveSet.set("start_time", 0);

      isPlaying = false;
      currentTimeBeats = 0;
      break;

    default:
      throw new Error(`playback failed: unknown action "${action}"`);
  }

  // Convert beats back to bar|beat for the response
  const currentTime = abletonBeatsToBarBeat(
    currentTimeBeats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Get current loop state and convert to bar|beat
  const currentLoopStartBeats = liveSet.getProperty("loop_start");
  const currentLoopLengthBeats = liveSet.getProperty("loop_length");
  const currentLoopStart = abletonBeatsToBarBeat(
    currentLoopStartBeats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );
  const currentLoopEnd = abletonBeatsToBarBeat(
    currentLoopStartBeats + currentLoopLengthBeats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Handle view switching if requested
  if (switchView) {
    let targetView = null;
    if (action === "play-arrangement") {
      targetView = "arrangement";
    } else if (action === "play-scene" || action === "play-session-clips") {
      targetView = "session";
    }

    if (targetView) {
      select({ view: targetView });
    }
  }

  // Get tracks that are currently following the arrangement
  const trackIds = liveSet.getChildIds("tracks");
  const arrangementFollowerTrackIds = trackIds
    .filter((trackId) => {
      const track = LiveAPI.from(trackId);
      return track.exists() && track.getProperty("back_to_arranger") === 0;
    })
    .map((trackId) => trackId.replace("id ", ""))
    .join(",");

  // Build result object conditionally
  const result = {
    playing: isPlaying,
    currentTime,
  };

  // Only include arrangementLoop if loop is enabled
  const loopEnabled = loop ?? liveSet.getProperty("loop") > 0;
  if (loopEnabled) {
    result.arrangementLoop = {
      start: loopStart ?? currentLoopStart,
      end: loopEnd ?? currentLoopEnd,
    };
  }

  result.arrangementFollowerTrackIds = arrangementFollowerTrackIds;

  return result;
}
