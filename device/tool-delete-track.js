// device/tool-delete-track.js
/**
 * Deletes a track at the specified index
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @returns {Object} Result object with success or error information
 */
function deleteTrack({ trackIndex }) {
  const liveSet = new LiveAPI("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  if (trackIndex < 0 || trackIndex >= trackIds.length) {
    return {
      success: false,
      trackIndex,
      error: `Track index ${trackIndex} is out of range. Valid range: 0-${trackIds.length - 1}`,
    };
  }

  // Get the track ID before deletion
  const trackId = trackIds[trackIndex];
  const track = new LiveAPI(trackId);
  const trackName = track.getProperty("name");

  // Delete the track
  liveSet.call("delete_track", trackIndex);

  return {
    success: true,
    trackIndex,
    message: `Deleted track "${trackName}" at index ${trackIndex}`,
  };
}

module.exports = { deleteTrack };
