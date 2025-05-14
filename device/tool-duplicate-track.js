// device/tool-duplicate-track.js
const { readTrack } = require("./tool-read-track");

/**
 * Duplicates a track at the specified index
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {string} [args.name] - Optional name for the duplicated track
 * @returns {Object} Result object with information about the duplicated track
 */
function duplicateTrack({ trackIndex, name } = {}) {
  if (trackIndex == null) {
    throw new Error("duplicate-track failed: trackIndex is required");
  }

  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_track", trackIndex);

  if (name != null) {
    const newTrack = new LiveAPI(`live_set tracks ${trackIndex + 1}`);
    newTrack.set("name", name);
  }

  return readTrack({ trackIndex: trackIndex + 1 });
}

module.exports = { duplicateTrack };
