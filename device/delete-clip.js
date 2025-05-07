// device/delete-clip.js
/**
 * Deletes a clip at the specified track and clip slot
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} args.clipSlotIndex - Clip slot index (0-based)
 * @returns {Object} Result object with success or error information
 */
function deleteClip({ trackIndex, clipSlotIndex }) {
  // Get the clip slot
  const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);

  // Check if the clip slot has a clip
  if (clipSlot.get("has_clip") == 0) {
    return {
      success: false,
      trackIndex,
      clipSlotIndex,
      error: `No clip exists at track ${trackIndex}, clip slot ${clipSlotIndex}`,
    };
  }

  // Delete the clip
  clipSlot.call("delete_clip");

  return {
    success: true,
    trackIndex,
    clipSlotIndex,
    message: `Deleted clip at track ${trackIndex}, clip slot ${clipSlotIndex}`,
  };
}

module.exports = { deleteClip };
