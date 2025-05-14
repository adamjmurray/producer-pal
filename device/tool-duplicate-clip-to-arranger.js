// device/tool-duplicate-clip-to-arranger.js
const { readClip } = require("./tool-read-clip");

/**
 * Duplicates a clip from Session view to Arrangement view
 * @param {Object} args - The parameters
 * @param {string} args.clipId - ID of the clip to duplicate
 * @param {number} args.arrangerStartTime - Start time in beats for the duplicated clip
 * @param {string} [args.name] - Optional name for the duplicated clip
 * @returns {Object} Result object with information about the duplicated clip
 */
function duplicateClipToArranger({ clipId, arrangerStartTime, name } = {}) {
  if (!clipId) {
    throw new Error("duplicate-clip-to-arranger failed: clipId is required");
  }
  if (arrangerStartTime == null) {
    throw new Error("duplicate-clip-to-arranger failed: arrangerStartTime is required");
  }

  // Support "id {id}" (such as returned by childIds()) and id values directly
  const clipPath = clipId.startsWith("id ") ? clipId : `id ${clipId}`;
  const clip = new LiveAPI(clipPath);

  if (!clip.exists()) {
    throw new Error(`duplicate-clip-to-arranger failed: no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = Number.parseInt(clip.path.match(/live_set tracks (\d+)/)?.[1]);
  if (Number.isNaN(trackIndex)) {
    throw new Error(`duplicate-clip-to-arranger failed: no track index for clipId "${clipId}" (path=${clip.path})`);
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const newClipId = track.call("duplicate_clip_to_arrangement", `id ${clip.id}`, arrangerStartTime)?.[1];

  if (newClipId == null) {
    throw new Error(`duplicate-clip-to-arranger failed: clip failed to duplicate`);
  }

  if (name != null) {
    const newClip = new LiveAPI(`id ${newClipId}`);
    newClip.set("name", name);
  }

  const appView = new LiveAPI("live_app view");
  appView.call("show_view", "Arranger");

  return readClip({ clipId: newClipId });
}

module.exports = { duplicateClipToArranger };
