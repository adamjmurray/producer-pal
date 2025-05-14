// device/tool-delete-track.js
/**
 * Deletes a track at the specified id
 * @param {Object} args - The parameters
 * @param {number} args.id - Track id
 * @returns {Object} Result object with success or error information
 */
function deleteTrack({ id } = {}) {
  if (!id) {
    throw new Error("delete-track failed: id is required");
  }

  const trackPath = id.startsWith("id ") ? id : `id ${id}`;
  const track = new LiveAPI(trackPath);

  if (!track.exists()) {
    throw new Error(`delete-track failed: id "${id}" does not exist`);
  }
  if (track.type !== "Track") {
    throw new Error(`delete-track failed: id "${id}" was not a track (type=${track.type})`);
  }

  const trackIndex = Number(track.path.match(/live_set tracks (\d+)/)?.[1]);
  if (Number.isNaN(trackIndex)) {
    throw new Error(`delete-track failed: no track index for id "${id}" (path="${track.path}")`);
  }

  const liveSet = new LiveAPI("live_set");
  liveSet.call("delete_track", trackIndex);

  return { id, deleted: true };
}

module.exports = { deleteTrack };
