// src/tools/transport.js
import { abletonBeatsToBarBeat, barBeatToAbletonBeats } from "../notation/barbeat/barbeat-time";
import { parseCommaSeparatedIndices } from "../utils.js";

/**
 * Unified control for all playback functionality in both Arranger and Session views.
 * IMPORTANT: Tracks can either follow the Arrangement timeline or play Session clips independently.
 * When Session clips are launched, those tracks stop following the Arrangement until explicitly told to return.
 * @param {Object} args - The parameters
 * @param {string} args.action - Action to perform
 * @param {string} [args.startTime] - Position in bar|beat format to start playback from in the arrangement
 * @param {boolean} [args.loop] - Enable/disable arrangement loop
 * @param {string} [args.loopStart] - Loop start position in bar|beat format in the arrangement
 * @param {string} [args.loopEnd] - Loop end position in bar|beat format in the arrangement
 * @param {string} [args.followingTrackIndexes] - Comma-separated track indexes that should return to following the arrangement (like clicking 'Back to Arrangement' buttons)
 * @param {number} [args.sceneIndex] - Scene index for Session view operations (puts tracks into non-following state)
 * @param {string} [args.trackIndexes] - Comma-separated track indexes for Session view operations
 * @param {string} [args.clipSlotIndexes] - Comma-separated clip slot indexes for Session view operations
 * @returns {Object} Result with transport state
 */
export function transport({
  action,
  startTime,
  loop,
  loopStart,
  loopEnd,
  followingTrackIndexes,
  sceneIndex,
  trackIndexes,
  clipSlotIndexes,
} = {}) {
  if (!action) {
    throw new Error("transport failed: action is required");
  }
  const liveSet = new LiveAPI("live_set");
  const appView = new LiveAPI("live_app view");

  // Get song time signature for bar|beat conversions
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  // Convert bar|beat inputs to Ableton beats
  let startTimeBeats, loopStartBeats, loopEndBeats;

  if (startTime != null) {
    startTimeBeats = barBeatToAbletonBeats(startTime, songTimeSigNumerator, songTimeSigDenominator);
    liveSet.set("start_time", startTimeBeats);
  }
  if (loop != null) {
    liveSet.set("loop", loop);
  }
  if (loopStart != null) {
    loopStartBeats = barBeatToAbletonBeats(loopStart, songTimeSigNumerator, songTimeSigDenominator);
    liveSet.set("loop_start", loopStartBeats);
  }
  if (loopEnd != null) {
    loopEndBeats = barBeatToAbletonBeats(loopEnd, songTimeSigNumerator, songTimeSigDenominator);
    // Live API uses loop_length, not loop_end, so we need to calculate the length
    const actualLoopStartBeats = loopStartBeats ?? liveSet.getProperty("loop_start");
    const loopLengthBeats = loopEndBeats - actualLoopStartBeats;
    liveSet.set("loop_length", loopLengthBeats);
  }

  if (followingTrackIndexes) {
    const trackIndexList = parseCommaSeparatedIndices(followingTrackIndexes);

    for (const trackIndex of trackIndexList) {
      const track = new LiveAPI(`live_set tracks ${trackIndex}`);
      if (track.exists()) {
        track.set("back_to_arranger", 0);
      }
    }
  }

  // Default result values that will be overridden by specific actions
  // (for optimistic results to avoid a sleep() for playback state updates)
  let isPlaying = liveSet.getProperty("is_playing") > 0;
  let currentTimeBeats = liveSet.getProperty("current_song_time");

  switch (action) {
    case "play-arrangement":
      appView.call("show_view", "Arranger");
      if (startTime == null) {
        liveSet.set("start_time", 0);
        startTimeBeats = 0;
      }
      liveSet.call("start_playing");

      isPlaying = true;
      currentTimeBeats = startTimeBeats ?? 0;
      break;

    case "update-arrangement":
      appView.call("show_view", "Arranger");
      // No playback state change, just the loop and follow settings above
      break;

    case "play-scene":
      if (sceneIndex == null) {
        throw new Error(`transport failed: sceneIndex is required for action "play-scene"`);
      }
      const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);
      if (!scene.exists()) {
        throw new Error(`transport play-session-scene action failed: scene at sceneIndex=${sceneIndex} does not exist`);
      }

      appView.call("show_view", "Session");
      scene.call("fire");

      isPlaying = true;
      break;

    case "play-session-clip":
      if (!trackIndexes) {
        throw new Error(`transport failed: trackIndexes is required for action "play-session-clip"`);
      }
      if (!clipSlotIndexes) {
        throw new Error(`transport failed: clipSlotIndexes is required for action "play-session-clip"`);
      }

      const trackIndexList = parseCommaSeparatedIndices(trackIndexes);
      const clipSlotIndexList = parseCommaSeparatedIndices(clipSlotIndexes);

      appView.call("show_view", "Session");

      for (let i = 0; i < trackIndexList.length; i++) {
        const trackIndex = trackIndexList[i];
        const clipSlotIndex =
          i < clipSlotIndexList.length ? clipSlotIndexList[i] : clipSlotIndexList[clipSlotIndexList.length - 1];

        const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);
        if (!clipSlot.exists()) {
          throw new Error(
            `transport play-session-clip action failed: clip slot at trackIndex=${trackIndex}, clipSlotIndex=${clipSlotIndex} does not exist`
          );
        }
        if (!clipSlot.getProperty("has_clip")) {
          throw new Error(
            `transport play-session-clip action failed: no clip at trackIndex=${trackIndex}, clipSlotIndex=${clipSlotIndex}`
          );
        }
        clipSlot.call("fire");
      }

      isPlaying = true;
      break;

    case "stop-track-session-clip":
      if (!trackIndexes) {
        throw new Error(`transport failed: trackIndexes is required for action "stop-track-session-clip"`);
      }

      const stopTrackIndexList = parseCommaSeparatedIndices(trackIndexes);

      appView.call("show_view", "Session");

      for (const trackIndex of stopTrackIndexList) {
        const track = new LiveAPI(`live_set tracks ${trackIndex}`);
        if (!track.exists()) {
          throw new Error(
            `transport stop-track-session-clip action failed: track at trackIndex=${trackIndex} does not exist`
          );
        }
        track.call("stop_all_clips");
      }
      // this doesn't affect the isPlaying state
      break;

    case "stop-all-session-clips":
      appView.call("show_view", "Session");
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
      throw new Error(`transport failed: unknown action "${action}"`);
  }

  // Convert beats back to bar|beat for the response
  const currentTime = abletonBeatsToBarBeat(currentTimeBeats, songTimeSigNumerator, songTimeSigDenominator);

  // Get current loop state and convert to bar|beat
  const currentLoopStartBeats = liveSet.getProperty("loop_start");
  const currentLoopLengthBeats = liveSet.getProperty("loop_length");
  const currentLoopStart = abletonBeatsToBarBeat(currentLoopStartBeats, songTimeSigNumerator, songTimeSigDenominator);
  const currentLoopEnd = abletonBeatsToBarBeat(
    currentLoopStartBeats + currentLoopLengthBeats,
    songTimeSigNumerator,
    songTimeSigDenominator
  );

  return Object.fromEntries(
    Object.entries({
      // reflect the args back:
      action,
      startTime,
      loop: loop ?? liveSet.getProperty("loop") > 0,
      loopStart: loopStart ?? currentLoopStart,
      loopEnd: loopEnd ?? currentLoopEnd,
      followingTrackIndexes,
      sceneIndex,
      trackIndexes,
      clipSlotIndexes,
      // and include some additional relevant state:
      isPlaying,
      currentTime,
    }).filter(([_, v]) => v !== undefined) // remove any undefined args
  );
}
