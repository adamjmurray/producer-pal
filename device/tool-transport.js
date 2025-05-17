// device/tool-transport.js
const { readClip } = require("./tool-read-clip");
const { readScene } = require("./tool-read-scene");
const console = require("./console");

/**
 * Unified control for all playback functionality in both Arrangement and Session views
 * @param {Object} args - The parameters
 * @param {string} args.action - Transport action to perform
 * @param {number} [args.startTime] - Position in beats to start playback from
 * @param {boolean} [args.loop] - Enable/disable Arrangement loop
 * @param {number} [args.loopStart] - Loop start position in beats
 * @param {number} [args.loopLength] - Loop length in beats
 * @param {Array<number>} [args.followingTracks] - Tracks that should follow the Arranger
 * @param {number} [args.trackIndex] - Track index for Session view operations
 * @param {number} [args.clipSlotIndex] - Clip slot index for Session view operations
 * @param {number} [args.sceneIndex] - Scene index for Session view operations
 * @returns {Object} Result with transport state
 */
function transport({
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

  switch (action) {
    case "play-arrangement":
    case "stop-arrangement":
    case "update-arrangement":
      return performArrangementAction({
        action,
        startTime,
        loop,
        loopStart,
        loopLength,
        followingTracks,
      });

    case "play-scene":
      // TODO: We can rely entirely on the scene.exists() check
      if (sceneIndex == null) {
        throw new Error(`transport failed: sceneIndex is required for action "play-scene"`);
      }
      const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);
      if (!scene.exists()) {
        throw new Error(`transport play-session-scene action failed: scene at sceneIndex=${sceneIndex} does not exist`);
      }

      appView.call("show_view", "Session");
      scene.call("fire");

      const targetScene = readScene({ sceneIndex });
      return {
        isPlaying: true,
        currentTime: liveSet.getProperty("current_song_time"),
        loop: liveSet.getProperty("loop") > 0,
        loopStart: liveSet.getProperty("loop_start"),
        loopLength: liveSet.getProperty("loop_length"),
        targetScene, // TODO: don't return this
        actionPerformed: action,
      };

    case "play-session-clip":
      // TODO: We can rely entirely on the clipSlot.exists() check
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

      const targetClip = readClip({ trackIndex, clipSlotIndex });
      return {
        isPlaying: true,
        currentTime: liveSet.getProperty("current_song_time"),
        loop: liveSet.getProperty("loop") > 0,
        loopStart: liveSet.getProperty("loop_start"),
        loopLength: liveSet.getProperty("loop_length"),
        targetClip, // TODO: don't return this
        actionPerformed: action,
      };

    case "stop-track-session-clip":
      // TODO: We can rely entirely on the track.exists() check
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

      return {
        isPlaying: false, // This might not be accurate if other tracks are still playing. TODO: It's not! Fix it
        currentTime: liveSet.getProperty("current_song_time"),
        loop: liveSet.getProperty("loop") > 0,
        loopStart: liveSet.getProperty("loop_start"),
        loopLength: liveSet.getProperty("loop_length"),
        actionPerformed: action,
      };

    case "stop-all-session-clips":
      appView.call("show_view", "Session");
      liveSet.call("stop_all_clips");

      return {
        isPlaying: false,
        currentTime: liveSet.getProperty("current_song_time"),
        loop: liveSet.getProperty("loop") > 0,
        loopStart: liveSet.getProperty("loop_start"),
        loopLength: liveSet.getProperty("loop_length"),
        actionPerformed: action,
      };

    default:
      throw new Error(`transport failed: unknown action "${action}"`);
  }
}

function performArrangementAction({ action, startTime = 0, loop, loopStart, loopLength, followingTracks }) {
  const liveSet = new LiveAPI("live_set");

  // Switch to Arranger view
  new LiveAPI("live_app view").call("show_view", "Arranger");

  // Set loop parameters if provided
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

  if (action === "play-arrangement") {
    liveSet.set("start_time", startTime);
    liveSet.call("start_playing");
  } else if (action === "stop-arrangement") {
    liveSet.call("stop_playing");
    liveSet.set("start_time", 0);
  }
  // For "update", we don't change playback state - just the loop settings above

  return {
    isPlaying: (() => {
      switch (action) {
        case "play-arrangement":
          return true;
        case "stop-arrangement":
          return false;
        default:
          return liveSet.getProperty("is_playing") > 0;
      }
    })(),
    currentTime: (() => {
      switch (action) {
        case "play-arrangement":
          return startTime;
        case "stop-arrangement":
          return 0;
        default:
          return liveSet.getProperty("current_song_time");
      }
    })(),
    loop: loop ?? liveSet.getProperty("loop") > 0,
    loopStart: loopStart ?? liveSet.getProperty("loop_start"),
    loopLength: loopLength ?? liveSet.getProperty("loop_length"),
  };
}

module.exports = { transport };
