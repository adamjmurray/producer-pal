// src/tools/duplicate.js
import { abletonBeatsToBarBeat, barBeatToAbletonBeats } from "../notation/barbeat/barbeat-time";

/**
 * Duplicates an object based on its type
 * @param {Object} args - The parameters
 * @param {string} args.type - Type of object to duplicate ("track", "scene", or "clip")
 * @param {string} args.id - ID of the object to duplicate
 * @param {number} [args.count=1] - Number of duplicates to create
 * @param {string} [args.destination] - Destination for clip duplication ("session" or "arranger"), required when type is "clip"
 * @param {number} [args.arrangerStartTime] - Start time in bar:beat format for Arranger view clips (uses song time signature)
 * @param {string} [args.name] - Optional name for the duplicated object(s)
 * @param {boolean} [args.includeClips] - Whether to include clips when duplicating tracks or scenes
 * @returns {Object|Array<Object>} Result object(s) with information about the duplicated object(s)
 */
export function duplicate({ type, id, count = 1, destination, arrangerStartTime, name, includeClips } = {}) {
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
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    throw new Error(`duplicate failed: id "${id}" does not exist`);
  }

  // Validate clip-specific and scene+arranger parameters once
  if (type === "clip") {
    if (!destination) {
      throw new Error("duplicate failed: destination is required for type 'clip'");
    }

    // TODO? Default to session like scene duplication?
    if (!["session", "arranger"].includes(destination)) {
      throw new Error("duplicate failed: destination must be 'session' or 'arranger'");
    }
  }

  if (destination === "arranger" && arrangerStartTime == null) {
    throw new Error("duplicate failed: arrangerStartTime is required when destination is 'arranger'");
  }

  const createdObjects = [];

  for (let i = 0; i < count; i++) {
    // Build the object name for this duplicate
    const objectName = name != null ? (count === 1 ? name : i === 0 ? name : `${name} ${i + 1}`) : undefined;

    let newObjectMetadata;

    if (destination === "arranger") {
      // All arranger operations need song time signature for bar:beat conversion
      const liveSet = new LiveAPI("live_set");
      const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
      const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

      // Convert arrangerStartTime from bar:beat to Ableton beats once
      const baseArrangerStartBeats = barBeatToAbletonBeats(
        arrangerStartTime,
        songTimeSigNumerator,
        songTimeSigDenominator
      );

      if (type === "scene") {
        const sceneIndex = Number(object.path.match(/live_set scenes (\d+)/)?.[1]);
        if (Number.isNaN(sceneIndex)) {
          throw new Error(`duplicate failed: no scene index for id "${id}" (path="${object.path}")`);
        }

        // For multiple scenes, place them sequentially to avoid overlap
        const sceneLength = calculateSceneLength(sceneIndex);
        const actualArrangerStartBeats = baseArrangerStartBeats + i * sceneLength;
        newObjectMetadata = duplicateSceneToArranger(id, actualArrangerStartBeats, objectName, includeClips);
      } else if (type === "clip") {
        // For multiple clips, place them sequentially to avoid overlap
        const clipLength = object.getProperty("length");
        const actualArrangerStartBeats = baseArrangerStartBeats + i * clipLength;
        newObjectMetadata = duplicateClipToArranger(id, actualArrangerStartBeats, objectName);
      }
    } else {
      // Session view operations (no bar:beat conversion needed)
      if (type === "track") {
        const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);
        if (Number.isNaN(trackIndex)) {
          throw new Error(`duplicate failed: no track index for id "${id}" (path="${object.path}")`);
        }
        // For multiple tracks, we need to account for previously created tracks
        const actualTrackIndex = trackIndex + i;
        newObjectMetadata = duplicateTrack(actualTrackIndex, objectName, includeClips);
      } else if (type === "scene") {
        const sceneIndex = Number(object.path.match(/live_set scenes (\d+)/)?.[1]);
        if (Number.isNaN(sceneIndex)) {
          throw new Error(`duplicate failed: no scene index for id "${id}" (path="${object.path}")`);
        }
        const actualSceneIndex = sceneIndex + i;
        newObjectMetadata = duplicateScene(actualSceneIndex, objectName, includeClips);
      } else if (type === "clip") {
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
  if (includeClips != null) result.includeClips = includeClips;

  // Return appropriate format based on count
  if (count === 1) {
    // For single duplicate, include the new object metadata directly
    return { ...result, ...createdObjects[0] };
  } else {
    // For multiple duplicates, include objects array
    return { ...result, objects: createdObjects };
  }
}

/**
 * Get minimal information about a clip for duplication results
 * @param {LiveAPI} clip - The clip to get info from
 * @returns {Object} Minimal clip info with id, trackIndex, and location
 */
function getMinimalClipInfo(clip) {
  const isArrangerClip = clip.getProperty("is_arrangement_clip") > 0;

  if (isArrangerClip) {
    const trackIndex = Number.parseInt(clip.path.match(/live_set tracks (\d+)/)?.[1]);
    if (Number.isNaN(trackIndex)) {
      throw new Error(`getMinimalClipInfo failed: could not determine trackIndex for clip (path="${clip.path}")`);
    }

    const arrangerStartTimeBeats = clip.getProperty("start_time");

    // Convert to bar:beat format using song time signature
    const liveSet = new LiveAPI("live_set");
    const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    const songTimeSigDenominator = liveSet.getProperty("signature_denominator");
    const arrangerStartTime = abletonBeatsToBarBeat(
      arrangerStartTimeBeats,
      songTimeSigNumerator,
      songTimeSigDenominator
    );

    return {
      id: clip.id,
      view: "Arranger",
      trackIndex,
      arrangerStartTime,
    };
  } else {
    const pathMatch = clip.path.match(/live_set tracks (\d+) clip_slots (\d+)/);
    const trackIndex = Number.parseInt(pathMatch?.[1]);
    const clipSlotIndex = Number.parseInt(pathMatch?.[2]);

    if (Number.isNaN(trackIndex) || Number.isNaN(clipSlotIndex)) {
      throw new Error(
        `getMinimalClipInfo failed: could not determine trackIndex/clipSlotIndex for clip (path="${clip.path}")`
      );
    }

    return {
      id: clip.id,
      view: "Session",
      trackIndex,
      clipSlotIndex,
    };
  }
}

function duplicateTrack(trackIndex, name, includeClips) {
  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_track", trackIndex);

  const newTrackIndex = trackIndex + 1;
  const newTrack = new LiveAPI(`live_set tracks ${newTrackIndex}`);

  if (name != null) {
    newTrack.set("name", name);
  }

  // Get all duplicated clips
  const duplicatedClips = [];

  if (includeClips === false) {
    // Delete all clips that were duplicated
    // Session clips
    const sessionClipSlotIds = newTrack.getChildIds("clip_slots");
    for (const clipSlotId of sessionClipSlotIds) {
      const clipSlot = new LiveAPI(clipSlotId);
      if (clipSlot.getProperty("has_clip")) {
        clipSlot.call("delete_clip");
      }
    }

    // Arranger clips - must use track.delete_clip with clip ID
    const arrangerClipIds = newTrack.getChildIds("arrangement_clips");
    for (const clipId of arrangerClipIds) {
      newTrack.call("delete_clip", clipId);
    }
  } else {
    // Default behavior: collect info about duplicated clips
    // Session clips
    const sessionClipSlotIds = newTrack.getChildIds("clip_slots");
    //for (let clipSlotIndex = 0; clipSlotIndex < sessionClipSlotIds.length; clipSlotIndex++) {
    //const clipSlot = new LiveAPI(`live_set tracks ${newTrackIndex} clip_slots ${clipSlotIndex}`);
    for (const clipSlotId of sessionClipSlotIds) {
      const clipSlot = new LiveAPI(clipSlotId);
      if (clipSlot.getProperty("has_clip")) {
        const clip = new LiveAPI(`${clipSlot.path} clip`);
        duplicatedClips.push(getMinimalClipInfo(clip));
      }
    }

    // Arranger clips
    const arrangerClipIds = newTrack.getChildIds("arrangement_clips");
    for (const clipId of arrangerClipIds) {
      const clip = new LiveAPI(clipId);
      if (clip.exists()) {
        duplicatedClips.push(getMinimalClipInfo(clip));
      }
    }
  }

  // Return optimistic metadata
  const result = {
    newTrackId: newTrack.id,
    newTrackIndex,
    duplicatedClips,
  };

  if (name != null) result.name = name;
  return result;
}

function duplicateScene(sceneIndex, name, includeClips) {
  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_scene", sceneIndex);

  const newSceneIndex = sceneIndex + 1;
  const newScene = new LiveAPI(`live_set scenes ${newSceneIndex}`);

  if (name != null) {
    newScene.set("name", name);
  }

  // Get all duplicated clips in this scene
  const duplicatedClips = [];
  const trackIds = liveSet.getChildIds("tracks");

  if (includeClips === false) {
    // Delete all clips in the duplicated scene
    for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
      const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${newSceneIndex}`);
      if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
        clipSlot.call("delete_clip");
      }
    }
  } else {
    // Default behavior: collect info about duplicated clips
    for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
      const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${newSceneIndex}`);
      if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
        const clip = new LiveAPI(`${clipSlot.path} clip`);
        if (clip.exists()) {
          duplicatedClips.push(getMinimalClipInfo(clip));
        }
      }
    }
  }

  // Return optimistic metadata
  const result = {
    newSceneId: newScene.id,
    newSceneIndex,
    duplicatedClips,
  };

  if (name != null) result.name = name;
  return result;
}

function calculateSceneLength(sceneIndex) {
  const liveSet = new LiveAPI("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  let maxLength = 4; // Default minimum scene length

  for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
    const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${sceneIndex}`);

    if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
      const clip = new LiveAPI(`${clipSlot.path} clip`);
      const clipLength = clip.getProperty("length");
      maxLength = Math.max(maxLength, clipLength);
    }
  }

  return maxLength;
}

function duplicateSceneToArranger(sceneId, arrangerStartTimeBeats, name, includeClips) {
  const scene = LiveAPI.from(sceneId);

  if (!scene.exists()) {
    throw new Error(`duplicate failed: scene with id "${sceneId}" does not exist`);
  }

  const sceneIndex = Number(scene.path.match(/live_set scenes (\d+)/)?.[1]);
  if (Number.isNaN(sceneIndex)) {
    throw new Error(`duplicate failed: no scene index for id "${sceneId}" (path="${scene.path}")`);
  }

  const liveSet = new LiveAPI("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  const duplicatedClips = [];

  if (includeClips !== false) {
    // Only duplicate clips if includeClips is not explicitly false
    // Find all clips in this scene and duplicate them to arranger
    for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
      const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${sceneIndex}`);

      if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
        const clip = new LiveAPI(`${clipSlot.path} clip`);
        const track = new LiveAPI(`live_set tracks ${trackIndex}`);

        const newClipResult = track.call("duplicate_clip_to_arrangement", `id ${clip.id}`, arrangerStartTimeBeats);
        const newClip = LiveAPI.from(newClipResult);

        if (name != null) {
          newClip.set("name", name);
          duplicatedClips.push({ ...getMinimalClipInfo(newClip), name });
        } else {
          duplicatedClips.push(getMinimalClipInfo(newClip));
        }
      }
    }
  }

  const appView = new LiveAPI("live_app view");
  appView.call("show_view", "Arranger");

  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  const result = {
    arrangerStartTime: abletonBeatsToBarBeat(arrangerStartTimeBeats, songTimeSigNumerator, songTimeSigDenominator),
    duplicatedClips,
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
    duplicatedClip: getMinimalClipInfo(newClip),
  };

  if (name != null) result.duplicatedClip.name = name;
  return result;
}

function duplicateClipToArranger(clipId, arrangerStartTimeBeats, name) {
  // Support "id {id}" (such as returned by childIds()) and id values directly
  const clip = LiveAPI.from(clipId);

  if (!clip.exists()) {
    throw new Error(`duplicate failed: no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = Number.parseInt(clip.path.match(/live_set tracks (\d+)/)?.[1]);
  if (Number.isNaN(trackIndex)) {
    throw new Error(`duplicate failed: no track index for clipId "${clipId}" (path=${clip.path})`);
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const newClipResult = track.call("duplicate_clip_to_arrangement", `id ${clip.id}`, arrangerStartTimeBeats);
  const newClip = LiveAPI.from(newClipResult);

  if (name != null) {
    newClip.set("name", name);
  }

  const appView = new LiveAPI("live_app view");
  appView.call("show_view", "Arranger");

  const liveSet = new LiveAPI("live_set");
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  const result = {
    arrangerStartTime: abletonBeatsToBarBeat(arrangerStartTimeBeats, songTimeSigNumerator, songTimeSigDenominator),
    duplicatedClip: getMinimalClipInfo(newClip),
  };

  if (name != null) result.name = name;
  return result;
}
