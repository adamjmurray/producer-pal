// src/tools/duplicate.js
import { readClip } from "./read-clip";
import { readScene } from "./read-scene";
import { readTrack } from "./read-track";

/**
 * Duplicates an object based on its type
 * @param {Object} args - The parameters
 * @param {string} args.type - Type of object to duplicate ("track", "scene", or "clip")
 * @param {string} args.id - ID of the object to duplicate
 * @param {string} [args.destination] - Destination for clip duplication ("session" or "arranger"), required when type is "clip"
 * @param {number} [args.arrangerStartTime] - Start time in beats for Arranger view, required when destination is "arranger"
 * @param {string} [args.name] - Optional name for the duplicated object
 * @returns {Object} Result object with information about the duplicated object
 */
export function duplicate({ type, id, destination, arrangerStartTime, name } = {}) {
  if (!type) {
    throw new Error("duplicate failed: type is required");
  }

  const validTypes = ["track", "scene", "clip"];
  if (!validTypes.includes(type)) {
    throw new Error(`duplicate failed: type must be one of ${validTypes.join(", ")}`);
  }

  if (!id) {
    throw new Error("duplicate failed: id is required");
  }

  // Convert string ID to LiveAPI path if needed
  const objectPath = id.startsWith("id ") ? id : `id ${id}`;
  const object = new LiveAPI(objectPath);

  if (!object.exists()) {
    throw new Error(`duplicate failed: id "${id}" does not exist`);
  }

  // Track duplication
  if (type === "track") {
    const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);
    if (Number.isNaN(trackIndex)) {
      throw new Error(`duplicate failed: no track index for id "${id}" (path="${object.path}")`);
    }
    duplicateTrack(trackIndex, name);
  }

  // Scene duplication
  else if (type === "scene") {
    const sceneIndex = Number(object.path.match(/live_set scenes (\d+)/)?.[1]);
    if (Number.isNaN(sceneIndex)) {
      throw new Error(`duplicate failed: no scene index for id "${id}" (path="${object.path}")`);
    }
    duplicateScene(sceneIndex, name);
  }

  // Clip duplication
  else if (type === "clip") {
    if (!destination) {
      throw new Error("duplicate failed: destination is required for type 'clip'");
    }

    if (!["session", "arranger"].includes(destination)) {
      throw new Error("duplicate failed: destination must be 'session' or 'arranger'");
    }

    if (destination === "arranger") {
      if (arrangerStartTime == null) {
        throw new Error("duplicate failed: arrangerStartTime is required when destination is 'arranger'");
      }
      duplicateClipToArranger(id, arrangerStartTime, name);
    } else {
      // destination === "session"
      // Extract the track and clip slot indices
      const match = object.path.match(/live_set tracks (\d+) clip_slots (\d+)/);
      if (!match) {
        throw new Error(`duplicate failed: no track or clip slot index for clip id "${id}" (path="${object.path}")`);
      }
      const trackIndex = Number(match[1]);
      const clipSlotIndex = Number(match[2]);

      duplicateClipSlot(trackIndex, clipSlotIndex, name);
    }
  }

  return {
    type,
    id,
    ...(arrangerStartTime != null ? { arrangerStartTime } : {}),
    ...(destination != null ? { destination } : {}),
    ...(name != null ? { name } : {}),
    duplicated: true,
  };
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
