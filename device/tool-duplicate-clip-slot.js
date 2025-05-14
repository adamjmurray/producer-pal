// device/tool-duplicate-clip-slot.js
const { readClip } = require("./tool-read-clip");

/**
 * Duplicates a clip slot at the specified position in a track
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} args.clipSlotIndex - Clip slot index (0-based) to duplicate
 * @returns {Object} Result object with information about the duplicated clip
 */
function duplicateClipSlot({ trackIndex, clipSlotIndex } = {}) {
  if (trackIndex == null) {
    throw new Error("duplicate-clip-slot failed: trackIndex is required");
  }
  if (clipSlotIndex == null) {
    throw new Error("duplicate-clip-slot failed: clipSlotIndex is required");
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    throw new Error(`duplicate-clip-slot failed: track with index ${trackIndex} does not exist`);
  }

  track.call("duplicate_clip_slot", clipSlotIndex);
  // TODO: check the results (handle invalid clipSlotIndex)

  return readClip({ trackIndex, clipSlotIndex: clipSlotIndex + 1 });
}

module.exports = { duplicateClipSlot };
