// device/tool-duplicate.js
const { readClip } = require("./tool-read-clip");
const { readScene } = require("./tool-read-scene");
const { readTrack } = require("./tool-read-track");

/**
 * Duplicates an object based on its type
 * @param {Object} args - The parameters
 * @param {string} args.type - Type of object to duplicate ("track", "scene", "clip-slot", or "clip-to-arranger")
 * @param {number} [args.trackIndex] - Track index (0-based), required for track and clip-slot
 * @param {number} [args.clipSlotIndex] - Clip slot index (0-based), required for clip-slot
 * @param {number} [args.sceneIndex] - Scene index (0-based), required for scene
 * @param {string} [args.clipId] - Clip ID, required for clip-to-arranger
 * @param {number} [args.arrangerStartTime] - Start time in beats for Arranger view, required for clip-to-arranger
 * @param {string} [args.name] - Optional name for the duplicated object
 * @returns {Object} Result object with information about the duplicated object
 */
function duplicate({ type, trackIndex, clipSlotIndex, sceneIndex, clipId, arrangerStartTime, name } = {}) {
  if (!type) {
    throw new Error("duplicate failed: type is required");
  }

  const validTypes = ["track", "scene", "clip-slot", "clip-to-arranger"];
  if (!validTypes.includes(type)) {
    throw new Error(`duplicate failed: type must be one of ${validTypes.join(", ")}`);
  }

  // Validate required parameters based on type
  if (type === "track") {
    if (trackIndex == null) {
      throw new Error("duplicate failed: trackIndex is required for type 'track'");
    }
    return duplicateTrack(trackIndex, name);
  } else if (type === "scene") {
    if (sceneIndex == null) {
      throw new Error("duplicate failed: sceneIndex is required for type 'scene'");
    }
    return duplicateScene(sceneIndex, name);
  } else if (type === "clip-slot") {
    if (trackIndex == null) {
      throw new Error("duplicate failed: trackIndex is required for type 'clip-slot'");
    }
    if (clipSlotIndex == null) {
      throw new Error("duplicate failed: clipSlotIndex is required for type 'clip-slot'");
    }
    return duplicateClipSlot(trackIndex, clipSlotIndex, name);
  } else if (type === "clip-to-arranger") {
    if (!clipId) {
      throw new Error("duplicate failed: clipId is required for type 'clip-to-arranger'");
    }
    if (arrangerStartTime == null) {
      throw new Error("duplicate failed: arrangerStartTime is required for type 'clip-to-arranger'");
    }
    return duplicateClipToArranger(clipId, arrangerStartTime, name);
  }
}

function duplicateTrack(trackIndex, name) {
  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_track", trackIndex);

  if (name != null) {
    const newTrack = new LiveAPI(`live_set tracks ${trackIndex + 1}`);
    newTrack.set("name", name);
  }

  return readTrack({ trackIndex: trackIndex + 1 });
}

function duplicateScene(sceneIndex, name) {
  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_scene", sceneIndex);

  if (name != null) {
    const newScene = new LiveAPI(`live_set scenes ${sceneIndex + 1}`);
    newScene.set("name", name);
  }

  return readScene({ sceneIndex: sceneIndex + 1 });
}

function duplicateClipSlot(trackIndex, clipSlotIndex, name) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    throw new Error(`duplicate failed: track with index ${trackIndex} does not exist`);
  }

  track.call("duplicate_clip_slot", clipSlotIndex);

  if (name != null) {
    const newClip = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex + 1} clip`);
    newClip.set("name", name);
  }

  return readClip({ trackIndex, clipSlotIndex: clipSlotIndex + 1 });
}

function duplicateClipToArranger(clipId, arrangerStartTime, name) {
  // Support "id {id}" (such as returned by childIds()) and id values directly
  const clipPath = clipId.startsWith("id ") ? clipId : `id ${clipId}`;
  const clip = new LiveAPI(clipPath);

  if (!clip.exists()) {
    throw new Error(`duplicate failed: no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = Number.parseInt(clip.path.match(/live_set tracks (\d+)/)?.[1]);
  if (Number.isNaN(trackIndex)) {
    throw new Error(`duplicate failed: no track index for clipId "${clipId}" (path=${clip.path})`);
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const newClipId = track.call("duplicate_clip_to_arrangement", `id ${clip.id}`, arrangerStartTime)?.[1];

  if (newClipId == null) {
    throw new Error(`duplicate failed: clip failed to duplicate`);
  }

  if (name != null) {
    const newClip = new LiveAPI(`id ${newClipId}`);
    newClip.set("name", name);
  }

  const appView = new LiveAPI("live_app view");
  appView.call("show_view", "Arranger");

  return readClip({ clipId: newClipId });
}

module.exports = { duplicate };
