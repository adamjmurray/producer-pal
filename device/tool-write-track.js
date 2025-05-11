// device/tool-write-track.js
const { readTrack } = require("./tool-read-track");

/**
 * Updates a track at the specified index
 * @param {Object} args - The track parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {string} [args.name] - Optional track name
 * @param {string} [args.color] - Optional track color (CSS format: hex, rgb(), or named color)
 * @param {boolean} [args.mute] - Optional mute state
 * @param {boolean} [args.solo] - Optional solo state
 * @param {boolean} [args.arm] - Optional arm state
 * @param {number} [args.firedSlotIndex] - Optional clip slot index to fire (0-based)
 * @returns {Object} Result object with track information
 */
function writeTrack({
  trackIndex,
  name = null,
  color = null,
  mute = null,
  solo = null,
  arm = null,
  firedSlotIndex = null,
}) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (track.id === "id 0") {
    throw new Error(`Track index ${trackIndex} does not exist`);
  }

  // Update properties if provided
  if (name !== null) {
    track.set("name", name);
  }

  if (color !== null) {
    track.setColor(color);
  }

  if (mute !== null) {
    track.set("mute", mute);
  }

  if (solo !== null) {
    track.set("solo", solo);
  }

  if (arm !== null) {
    track.set("arm", arm);
  }

  // Handle firing a clip slot if requested
  if (firedSlotIndex !== null) {
    if (firedSlotIndex === -1) {
      track.call("stop_all_clips");
    } else {
      const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${firedSlotIndex}`);
      // Only fire if the clip slot exists (id is not "id 0")
      if (clipSlot.id !== "id 0") {
        clipSlot.call("fire");
      }
    }
  }

  return readTrack({ trackIndex });
}

module.exports = { writeTrack };
