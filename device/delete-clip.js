// device/delete-clip.js
/**
 * Deletes a clip at the specified track and clip slot
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} args.clipSlotIndex - Clip slot index (0-based)
 * @returns {Object} Result object with success or error information
 */
function deleteClip({ trackIndex, clipSlotIndex }) {
  const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);

  if (!clipSlot.getProperty("has_clip")) {
    return {
      success: false,
      trackIndex,
      clipSlotIndex,
      error: `No clip exists at track ${trackIndex}, clip slot ${clipSlotIndex}`,
    };
  }

  clipSlot.call("delete_clip");

  return {
    success: true,
    trackIndex,
    clipSlotIndex,
    message: `Deleted clip at track ${trackIndex}, clip slot ${clipSlotIndex}`,
  };
}

module.exports = { deleteClip };
