// device/tool-transport.js
const { playSessionClip } = require("./tool-play-session-clip");
const { playSessionScene } = require("./tool-play-session-scene");
const { stopSessionClip } = require("./tool-stop-session-clip");
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

  if (action === "play-arrangement" || action === "stop-arrangement" || action === "update-arrangement") {
    return arrangementTransport({
      action,
      startTime,
      loop,
      loopStart,
      loopLength,
      followingTracks,
    });
  } else if (action === "play-scene") {
    if (sceneIndex == null) {
      throw new Error(`transport failed: sceneIndex is required for action "play-scene"`);
    }

    new LiveAPI("live_app view").call("show_view", "Session");

    playSessionScene({ sceneIndex });

    // Try to get the scene that was triggered
    let targetScene;
    try {
      targetScene = readScene({ sceneIndex });
    } catch (e) {
      // Ignore errors reading the scene
    }

    const liveSet = new LiveAPI("live_set");

    return {
      isPlaying: true,
      currentTime: liveSet.getProperty("current_song_time"),
      loop: liveSet.getProperty("loop") > 0,
      loopStart: liveSet.getProperty("loop_start"),
      loopLength: liveSet.getProperty("loop_length"),
      targetScene, // TODO: don't return this
      actionPerformed: action,
    };
  } else if (action === "play-session-clip") {
    if (trackIndex == null) {
      throw new Error(`transport failed: trackIndex is required for action "play-session-clip"`);
    }
    if (clipSlotIndex == null) {
      throw new Error(`transport failed: clipSlotIndex is required for action "play-session-clip"`);
    }

    new LiveAPI("live_app view").call("show_view", "Session");

    const result = playSessionClip({ trackIndex, clipSlotIndex });

    // Try to get the clip that was triggered
    let targetClip;
    try {
      targetClip = readClip({ trackIndex, clipSlotIndex });
    } catch (e) {
      // Ignore errors reading the clip
    }

    const liveSet = new LiveAPI("live_set");

    return {
      isPlaying: true,
      currentTime: liveSet.getProperty("current_song_time"),
      loop: liveSet.getProperty("loop") > 0,
      loopStart: liveSet.getProperty("loop_start"),
      loopLength: liveSet.getProperty("loop_length"),
      targetClip, // TODO: don't return this
      actionPerformed: action,
    };
  } else if (action === "stop-track-session-clip") {
    if (trackIndex == null) {
      throw new Error(`transport failed: trackIndex is required for action "stop-track-session-clip"`);
    }

    new LiveAPI("live_app view").call("show_view", "Session");

    stopSessionClip({ trackIndex });

    const liveSet = new LiveAPI("live_set");

    return {
      isPlaying: false, // This might not be accurate if other tracks are still playing
      currentTime: liveSet.getProperty("current_song_time"),
      loop: liveSet.getProperty("loop") > 0,
      loopStart: liveSet.getProperty("loop_start"),
      loopLength: liveSet.getProperty("loop_length"),
      actionPerformed: action,
    };
  } else if (action === "stop-all-session-clips") {
    new LiveAPI("live_app view").call("show_view", "Session");

    // -1 means stop all clips in all tracks
    const result = stopSessionClip({ trackIndex: -1 });

    const liveSet = new LiveAPI("live_set");

    return {
      isPlaying: false,
      currentTime: liveSet.getProperty("current_song_time"),
      loop: liveSet.getProperty("loop") > 0,
      loopStart: liveSet.getProperty("loop_start"),
      loopLength: liveSet.getProperty("loop_length"),
      actionPerformed: action,
    };
  } else {
    throw new Error(`transport failed: unknown action "${action}"`);
  }
}

function arrangementTransport({ action, startTime = 0, loop, loopStart, loopLength, followingTracks }) {
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
