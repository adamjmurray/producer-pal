// device/tool-transport.js
/**
 * Controls the Arrangement transport
 * @param {Object} args - The parameters
 * @param {string} args.action - Transport action to perform ('play', 'stop', or 'update-loop')
 * @param {number} [args.startTime=0] - Position in beats to start playback from (only used with 'play')
 * @param {boolean} [args.loop] - Enable/disable Arrangement loop
 * @param {number} [args.loopStart] - Loop start position in beats
 * @param {number} [args.loopLength] - Loop length in beats
 * @param {Array<number>} [args.followingTracks] - Tracks that should follow the Arranger
 * @returns {Object} Result with transport state
 */
function transport({ action, startTime = 0, loop, loopStart, loopLength, followingTracks } = {}) {
  if (!action) {
    throw new Error("transport failed: action is required");
  }

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

  if (action === "play") {
    liveSet.set("start_time", startTime);
    liveSet.call("start_playing");
  } else if (action === "stop") {
    liveSet.call("stop_playing");
    liveSet.set("start_time", 0);
  }
  // For "update-loop", we don't change playback state - just the loop settings above

  return {
    isPlaying: (() => {
      switch (action) {
        case "play":
          return true;
        case "stop":
          return false;
        default:
          return liveSet.getProperty("is_playing") > 0;
      }
    })(),
    currentTime: (() => {
      switch (action) {
        case "play":
          return startTime;
        case "stop":
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
