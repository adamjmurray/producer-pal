// device/tool-write-track.js
const { readTrack } = require("./tool-read-track");

// Maximum number of tracks we'll auto-create
const MAX_AUTO_CREATED_TRACKS = 30;

/**
 * Updates a track at the specified index
 * @param {Object} args - The track parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {string} [args.name] - Optional track name
 * @param {string} [args.color] - Optional track color (CSS format: hex, rgb(), or named color)
 * @param {boolean} [args.mute] - Optional mute state
 * @param {boolean} [args.solo] - Optional solo state
 * @param {boolean} [args.arm] - Optional arm state
 * @returns {Object} Result object with track information
 */
function writeTrack({ trackIndex, name, color, mute, solo, arm } = {}) {
  const liveSet = new LiveAPI("live_set");
  const currentTrackCount = liveSet.getChildIds("tracks").length;

  if (trackIndex >= MAX_AUTO_CREATED_TRACKS) {
    throw new Error(`Track index ${trackIndex} exceeds the maximum allowed value of ${MAX_AUTO_CREATED_TRACKS - 1}`);
  }

  if (trackIndex >= currentTrackCount) {
    const tracksToCreate = trackIndex - currentTrackCount + 1;
    for (let i = 0; i < tracksToCreate; i++) {
      liveSet.call("create_midi_track", -1); // -1 means append at the end
    }
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (name != null) {
    track.set("name", name);
  }

  if (color != null) {
    track.setColor(color);
  }

  if (mute != null) {
    track.set("mute", mute);
  }

  if (solo != null) {
    track.set("solo", solo);
  }

  if (arm != null) {
    track.set("arm", arm);
  }

  return readTrack({ trackIndex });
}

module.exports = { writeTrack, MAX_AUTO_CREATED_TRACKS };
