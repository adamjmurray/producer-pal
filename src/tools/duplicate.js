// src/tools/duplicate.js

/**
 * Duplicates an object based on its type
 * @param {Object} args - The parameters
 * @param {string} args.type - Type of object to duplicate ("track", "scene", or "clip")
 * @param {string} args.id - ID of the object to duplicate
 * @param {number} [args.count=1] - Number of duplicates to create
 * @param {string} [args.destination] - Destination for clip duplication ("session" or "arranger"), required when type is "clip"
 * @param {number} [args.arrangerStartTime] - Start time in beats for Arranger view, required when destination is "arranger"
 * @param {string} [args.name] - Optional name for the duplicated object(s)
 * @returns {Object|Array<Object>} Result object(s) with information about the duplicated object(s)
 */
export function duplicate({ type, id, count = 1, destination, arrangerStartTime, name } = {}) {
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

  if (count < 1) {
    throw new Error("duplicate failed: count must be at least 1");
  }

  // Convert string ID to LiveAPI path if needed
  const objectPath = id.startsWith("id ") ? id : `id ${id}`;
  const object = new LiveAPI(objectPath);

  if (!object.exists()) {
    throw new Error(`duplicate failed: id "${id}" does not exist`);
  }

  // Validate clip-specific parameters once
  if (type === "clip") {
    if (!destination) {
      throw new Error("duplicate failed: destination is required for type 'clip'");
    }

    if (!["session", "arranger"].includes(destination)) {
      throw new Error("duplicate failed: destination must be 'session' or 'arranger'");
    }

    if (destination === "arranger" && arrangerStartTime == null) {
      throw new Error("duplicate failed: arrangerStartTime is required when destination is 'arranger'");
    }
  }

  const createdObjects = [];

  for (let i = 0; i < count; i++) {
    // Build the object name for this duplicate
    const objectName = name != null ? (count === 1 ? name : i === 0 ? name : `${name} ${i + 1}`) : undefined;

    let newObjectMetadata;

    // Track duplication
    if (type === "track") {
      const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);
      if (Number.isNaN(trackIndex)) {
        throw new Error(`duplicate failed: no track index for id "${id}" (path="${object.path}")`);
      }
      // For multiple tracks, we need to account for previously created tracks
      const actualTrackIndex = trackIndex + i;
      newObjectMetadata = duplicateTrack(actualTrackIndex, objectName);
    }

    // Scene duplication
    else if (type === "scene") {
      const sceneIndex = Number(object.path.match(/live_set scenes (\d+)/)?.[1]);
      if (Number.isNaN(sceneIndex)) {
        throw new Error(`duplicate failed: no scene index for id "${id}" (path="${object.path}")`);
      }
      // For multiple scenes, we need to account for previously created scenes
      const actualSceneIndex = sceneIndex + i;
      newObjectMetadata = duplicateScene(actualSceneIndex, objectName);
    }

    // Clip duplication
    else if (type === "clip") {
      if (destination === "arranger") {
        // For arranger clips, place them sequentially to avoid overlap
        const clipLength = object.getProperty("length");
        const actualArrangerStartTime = arrangerStartTime + i * clipLength;
        newObjectMetadata = duplicateClipToArranger(id, actualArrangerStartTime, objectName);
      } else {
        // destination === "session"
        const match = object.path.match(/live_set tracks (\d+) clip_slots (\d+)/);
        if (!match) {
          throw new Error(`duplicate failed: no track or clip slot index for clip id "${id}" (path="${object.path}")`);
        }
        const trackIndex = Number(match[1]);
        const clipSlotIndex = Number(match[2]);

        // For session clips, duplicate_clip_slot always creates at source+1,
        // so we call it on the progressively increasing source index
        const sourceClipSlotIndex = clipSlotIndex + i;
        newObjectMetadata = duplicateClipSlot(trackIndex, sourceClipSlotIndex, objectName);
      }
    }

    createdObjects.push(newObjectMetadata);
  }

  // Build optimistic result object reflecting the input parameters
  const result = {
    type,
    id,
    count,
    duplicated: true,
  };

  // Add optional parameters that were provided
  if (destination != null) result.destination = destination;
  if (arrangerStartTime != null) result.arrangerStartTime = arrangerStartTime;
  if (name != null) result.name = name;

  // Return appropriate format based on count
  if (count === 1) {
    // For single duplicate, include the new object metadata directly
    return { ...result, ...createdObjects[0] };
  } else {
    // For multiple duplicates, include objects array
    return { ...result, objects: createdObjects };
  }
}

function duplicateTrack(trackIndex, name) {
  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_track", trackIndex);

  const newTrackIndex = trackIndex + 1;
  const newTrack = new LiveAPI(`live_set tracks ${newTrackIndex}`);

  if (name != null) {
    newTrack.set("name", name);
  }

  // Return optimistic metadata
  const result = {
    newId: newTrack.id,
    newTrackIndex,
  };

  if (name != null) result.name = name;
  return result;
}

function duplicateScene(sceneIndex, name) {
  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_scene", sceneIndex);

  const newSceneIndex = sceneIndex + 1;
  const newScene = new LiveAPI(`live_set scenes ${newSceneIndex}`);

  if (name != null) {
    newScene.set("name", name);
  }

  // Return optimistic metadata
  const result = {
    newId: newScene.id,
    newSceneIndex,
  };

  if (name != null) result.name = name;
  return result;
}

function duplicateClipSlot(trackIndex, sourceClipSlotIndex, name) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    throw new Error(`duplicate failed: track with index ${trackIndex} does not exist`);
  }

  // duplicate_clip_slot creates a new clip at sourceClipSlotIndex + 1
  track.call("duplicate_clip_slot", sourceClipSlotIndex);

  const newClipSlotIndex = sourceClipSlotIndex + 1;
  const newClip = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${newClipSlotIndex} clip`);

  if (name != null) {
    newClip.set("name", name);
  }

  // Return optimistic metadata
  const result = {
    newId: newClip.id,
    newTrackIndex: trackIndex,
    newClipSlotIndex,
  };

  if (name != null) result.name = name;
  return result;
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

  // Return optimistic metadata
  const result = {
    newId: newClipId,
    newTrackIndex: trackIndex,
    newArrangerStartTime: arrangerStartTime,
  };

  if (name != null) result.name = name;
  return result;
}
