// src/tool-transport.js
/**
 * Unified control for all playback functionality in both Arranger and Session views
 * @param {Object} args - The parameters
 * @param {string} args.action - Action to perform
 * @param {number} [args.startTime] - Position in beats to start playback from in the arrangement
 * @param {boolean} [args.loop] - Enable/disable arrangement loop
 * @param {number} [args.loopStart] - Loop start position in beats
 * @param {number} [args.loopLength] - Loop length in beats
 * @param {Array<number>} [args.followingTracks] - Tracks that should follow the arrangement
 * @param {number} [args.trackIndex] - Track index for Session view operations
 * @param {number} [args.clipSlotIndex] - Clip slot index for Session view operations
 * @param {number} [args.sceneIndex] - Scene index for Session view operations
 * @returns {Object} Result with transport state
 */
export function transport({
  action,
  startTime,
  loop,
  loopStart,
  loopLength,
  followingTracks,
  sceneIndex,
  trackIndex,
  clipSlotIndex,
} = {}) {
  if (!action) {
    throw new Error("transport failed: action is required");
  }
  const liveSet = new LiveAPI("live_set");
  const appView = new LiveAPI("live_app view");

  if (startTime != null) {
    liveSet.set("start_time", startTime);
  }
  if (loop != null) {
    liveSet.set("loop", loop);
  }
  if (loopStart != null) {
    liveSet.set("loop_start", loopStart);
  }
  if (loopLength != null) {
    liveSet.set("loop_length", loopLength);
  }

  if (followingTracks && followingTracks.length > 0) {
    if (followingTracks.includes(-1)) {
      // Make all tracks follow the arrangement
      liveSet.set("back_to_arranger", 0);
    } else {
      // Make specific tracks follow the arrangement
      for (const trackIndex of followingTracks) {
        const track = new LiveAPI(`live_set tracks ${trackIndex}`);
        if (track.exists()) {
          track.set("back_to_arranger", 0);
        }
      }
    }
  }

  // Default result values that will be overridden by specific actions
  // (for optimistic results to avoid a sleep() for playback state updates)
  let isPlaying = liveSet.getProperty("is_playing") > 0;
  let currentTime = liveSet.getProperty("current_song_time");

  switch (action) {
    case "play-arrangement":
      appView.call("show_view", "Arranger");
      if (startTime == null) {
        liveSet.set("start_time", 0);
      }
      liveSet.call("start_playing");

      isPlaying = true;
      currentTime = startTime ?? 0;
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
      if (trackIndex == null) {
        throw new Error(`transport failed: trackIndex is required for action "play-session-clip"`);
      }
      if (clipSlotIndex == null) {
        throw new Error(`transport failed: clipSlotIndex is required for action "play-session-clip"`);
      }
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
      appView.call("show_view", "Session");
      clipSlot.call("fire");

      isPlaying = true;
      break;

    case "stop-track-session-clip":
      if (trackIndex == null) {
        throw new Error(`transport failed: trackIndex is required for action "stop-track-session-clip"`);
      }
      const track = new LiveAPI(`live_set tracks ${trackIndex}`);
      if (!track.exists()) {
        throw new Error(
          `transport stop-track-session-clip action failed: track at trackIndex=${trackIndex} does not exist`
        );
      }
      appView.call("show_view", "Session");
      track.call("stop_all_clips");
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
      currentTime = 0;
      break;

    default:
      throw new Error(`transport failed: unknown action "${action}"`);
  }

  return Object.fromEntries(
    Object.entries({
      // reflect the args back:
      action,
      startTime,
      loop: loop ?? liveSet.getProperty("loop") > 0,
      loopStart: loopStart ?? liveSet.getProperty("loop_start"),
      loopLength: loopLength ?? liveSet.getProperty("loop_length"),
      followingTracks,
      sceneIndex,
      trackIndex,
      clipSlotIndex,
      // and include some additional relevant state:
      isPlaying,
      currentTime,
    }).filter(([_, v]) => v !== undefined) // remove any undefined args
  );
}
