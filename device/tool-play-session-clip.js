// device/tool-play-session-clip.js
/**
 * Plays a specific clip in the Session view
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} args.clipSlotIndex - Clip slot index (0-based)
 * @returns {Object} Result with success message
 */
function playSessionClip({ trackIndex, clipSlotIndex } = {}) {
  if (trackIndex == null) {
    throw new Error("play-session-clip failed: trackIndex is required");
  }
  if (clipSlotIndex == null) {
    throw new Error("play-session-clip failed: clipSlotIndex is required");
  }

  const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);

  if (!clipSlot.exists()) {
    throw new Error(
      `play-session-clip failed: clip slot at trackIndex=${trackIndex}, clipSlotIndex=${clipSlotIndex} does not exist`
    );
  }

  if (!clipSlot.getProperty("has_clip")) {
    throw new Error(`play-session-clip failed: no clip at trackIndex=${trackIndex}, clipSlotIndex=${clipSlotIndex}`);
  }

  // Switch to Session view
  new LiveAPI("live_app view").call("show_view", "Session");

  clipSlot.call("fire");

  return { message: `Clip at trackIndex=${trackIndex}, clipSlotIndex=${clipSlotIndex} has been triggered` };
}

module.exports = { playSessionClip };
