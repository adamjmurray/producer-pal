// src/tools/transport.js
/**
 * Unified control for all playback functionality in both Arranger and Session views
 * @param {Object} args - The parameters
 * @param {string} args.action - Action to perform
 * @param {number} [args.startTime] - Position in beats to start playback from in the arrangement
 * @param {boolean} [args.loop] - Enable/disable arrangement loop
 * @param {number} [args.loopStart] - Loop start position in beats
 * @param {number} [args.loopLength] - Loop length in beats
 * @param {string} [args.followingTrackIndexes] - Comma-separated track indexes that should follow the arrangement
 * @param {number} [args.sceneIndex] - Scene index for Session view operations
 * @param {string} [args.trackIndexes] - Comma-separated track indexes for Session view operations
 * @param {string} [args.clipSlotIndexes] - Comma-separated clip slot indexes for Session view operations
 * @returns {Object} Result with transport state
 */
export function transport({
  action,
  startTime,
  loop,
  loopStart,
  loopLength,
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

  if (followingTrackIndexes) {
    const trackIndexList = followingTrackIndexes
      .split(",")
      .map((index) => index.trim())
      .filter((index) => index.length > 0)
      .map((index) => parseInt(index, 10));

    for (const trackIndex of trackIndexList) {
      if (isNaN(trackIndex)) {
        throw new Error(`transport failed: invalid track index "${followingTrackIndexes}" in followingTrackIndexes`);
      }
      const track = new LiveAPI(`live_set tracks ${trackIndex}`);
      if (track.exists()) {
        track.set("back_to_arranger", 0);
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
      if (!trackIndexes) {
        throw new Error(`transport failed: trackIndexes is required for action "play-session-clip"`);
      }
      if (!clipSlotIndexes) {
        throw new Error(`transport failed: clipSlotIndexes is required for action "play-session-clip"`);
      }

      const trackIndexList = trackIndexes
        .split(",")
        .map((index) => index.trim())
        .filter((index) => index.length > 0)
        .map((index) => parseInt(index, 10));

      const clipSlotIndexList = clipSlotIndexes
        .split(",")
        .map((index) => index.trim())
        .filter((index) => index.length > 0)
        .map((index) => parseInt(index, 10));

      if (trackIndexList.some(isNaN)) {
        throw new Error(`transport failed: invalid track index in trackIndexes "${trackIndexes}"`);
      }
      if (clipSlotIndexList.some(isNaN)) {
        throw new Error(`transport failed: invalid clip slot index in clipSlotIndexes "${clipSlotIndexes}"`);
      }

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

      const stopTrackIndexList = trackIndexes
        .split(",")
        .map((index) => index.trim())
        .filter((index) => index.length > 0)
        .map((index) => parseInt(index, 10));

      if (stopTrackIndexList.some(isNaN)) {
        throw new Error(`transport failed: invalid track index in trackIndexes "${trackIndexes}"`);
      }

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
