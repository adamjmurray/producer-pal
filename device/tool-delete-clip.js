// device/tool-delete-clip.js
/**
 * Delete a clip
 * @param {Object} args - The parameters
 * @param {number} args.id - the id of the clip to delete
 * @returns {Object} Result object with success information
 */
function deleteClip({ id } = {}) {
  if (!id) {
    throw new Error("delete-clip failed: id is required");
  }

  // Convert string ID to LiveAPI path if needed
  const clipPath = id.startsWith("id ") ? id : `id ${id}`;
  const clip = new LiveAPI(clipPath);

  if (!clip.exists()) {
    throw new Error(`delete-clip failed: id "${id}" does not exist`);
  }
  if (clip.type !== "Clip") {
    throw new Error(`delete-clip failed: id "${id}" was not a clip (type=${clip.type})`);
  }

  const trackIndex = clip.path.match(/live_set tracks (\d+)/)?.[1];
  if (!trackIndex) {
    throw new Error(`delete-clip failed: no track index for id "${id}" (path="${clip.path}")`);
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  track.call("delete_clip", `id ${clip.id}`);

  return { id, deleted: true };
}

module.exports = { deleteClip };
