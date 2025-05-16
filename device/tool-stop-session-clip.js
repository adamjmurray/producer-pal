// device/tool-stop-session-clip.js
/**
 * Stops clips in Session view
 * @param {Object} args - The parameters
 * @param {(number|string)} args.trackIndex - Track index (0-based) or '*' to stop all clips
 * @returns {Object} Result with success message
 */
function stopSessionClip({ trackIndex } = {}) {
  if (trackIndex == null) {
    throw new Error("stop-session-clip failed: trackIndex is required");
  }

  const liveSet = new LiveAPI("live_set");

  if (trackIndex == -1) {
    // TODO? Switch to Session view
    // new LiveAPI("live_app view").call("show_view", "Session");

    liveSet.call("stop_all_clips");

    return { message: "All clips in all tracks stopped" };
  } else {
    const track = new LiveAPI(`live_set tracks ${trackIndex}`);

    if (!track.exists()) {
      throw new Error(`stop-session-clip failed: track at trackIndex=${trackIndex} does not exist`);
    }

    // TODO? Switch to Session view
    // new LiveAPI("live_app view").call("show_view", "Session");

    track.call("stop_all_clips");

    return {
      message: `Clips on trackIndex=${trackIndex} stopped`,
    };
  }
}

module.exports = { stopSessionClip };
