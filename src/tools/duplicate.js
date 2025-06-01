// src/tools/duplicate.js
import {
  abletonBeatsToBarBeat,
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../notation/barbeat/barbeat-time";
import { MAX_CLIP_BEATS } from "./constants";

/**
 * Parse arrangerLength from bar|beat duration format to absolute beats
 * @param {string} arrangerLength - Length in bar|beat duration format (e.g. "2|0" for exactly two bars)
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Length in Ableton beats
 */
function parseArrangerLength(arrangerLength, timeSigNumerator, timeSigDenominator) {
  const match = arrangerLength.match(/^(\d+)\|(\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error(
      `duplicate failed: arrangerLength must be in bar|beat duration format (e.g. "2|1"), got "${arrangerLength}"`
    );
  }

  try {
    const arrangerLengthBeats = barBeatDurationToAbletonBeats(arrangerLength, timeSigNumerator, timeSigDenominator);

    if (arrangerLengthBeats <= 0) {
      throw new Error(`duplicate failed: arrangerLength must be positive, got "${arrangerLength}"`);
    }

    return arrangerLengthBeats;
  } catch (error) {
    if (error.message.includes("Invalid bar|beat duration format")) {
      throw new Error(`duplicate failed: ${error.message}`);
    }
    if (error.message.includes("must be 0 or greater")) {
      throw new Error(`duplicate failed: arrangerLength ${error.message.replace("in duration ", "")}`);
    }
    throw error;
  }
}

/**
 * Create clips to fill the specified arrangement length
 * @param {LiveAPI} sourceClip - The source clip to duplicate
 * @param {LiveAPI} track - The track to create clips on
 * @param {number} arrangerStartTimeBeats - Start time in beats
 * @param {number} arrangerLengthBeats - Total length to fill in beats
 * @param {string} [name] - Optional name for the clips
 * @returns {Array<Object>} Array of minimal clip info objects
 */
function createClipsForLength(sourceClip, track, arrangerStartTimeBeats, arrangerLengthBeats, name) {
  const originalClipLength = sourceClip.getProperty("length");
  const isLooping = sourceClip.getProperty("looping") > 0;
  const duplicatedClips = [];

  if (arrangerLengthBeats <= originalClipLength) {
    // Case 1: Shorter than or equal to clip length - create clip with exact length
    const newClipResult = track.call("create_midi_clip", arrangerStartTimeBeats, arrangerLengthBeats);
    const newClip = LiveAPI.from(newClipResult);

    // Copy all properties from the original clip
    copyClipProperties(sourceClip, newClip, name);

    duplicatedClips.push(getMinimalClipInfo(newClip));
  } else if (isLooping) {
    // Case 2: Longer than clip length and clip is looping - create multiple clips
    let currentStartBeats = arrangerStartTimeBeats;
    let remainingLength = arrangerLengthBeats;

    while (remainingLength > 0) {
      const clipLength = Math.min(remainingLength, originalClipLength);
      const newClipResult = track.call("create_midi_clip", currentStartBeats, clipLength);
      const newClip = LiveAPI.from(newClipResult);

      // Copy all properties from the original clip
      copyClipProperties(sourceClip, newClip, name);

      duplicatedClips.push(getMinimalClipInfo(newClip));

      remainingLength -= clipLength;
      currentStartBeats += clipLength;
    }
  } else {
    // Case 3: Longer than clip length but clip is not looping - use original length
    const newClipResult = track.call("duplicate_clip_to_arrangement", `id ${sourceClip.id}`, arrangerStartTimeBeats);
    const newClip = LiveAPI.from(newClipResult);

    newClip.setAll({
      name: name,
    });

    duplicatedClips.push(getMinimalClipInfo(newClip));
  }

  return duplicatedClips;
}

/**
 * Copy all properties from source clip to destination clip
 * @param {LiveAPI} sourceClip - The clip to copy from
 * @param {LiveAPI} destClip - The clip to copy to
 * @param {string} [name] - Optional name override
 */
function copyClipProperties(sourceClip, destClip, name) {
  // Get all the properties we want to copy
  const properties = {
    name: (name ?? sourceClip.getProperty("name")) || null, // empty names are not allowed
    color: sourceClip.getColor(), // Use getColor() to get hex format
    signature_numerator: sourceClip.getProperty("signature_numerator"),
    signature_denominator: sourceClip.getProperty("signature_denominator"),
    looping: sourceClip.getProperty("looping"),
    loop_start: sourceClip.getProperty("loop_start"),
    loop_end: sourceClip.getProperty("loop_end"),
  };

  // Set all properties using setAll
  destClip.setAll(properties);

  // Copy notes if it's a MIDI clip
  if (sourceClip.getProperty("is_midi_clip")) {
    const { notes } = JSON.parse(sourceClip.call("get_notes_extended", 0, 127, 0, MAX_CLIP_BEATS));
    if (notes && notes.length > 0) {
      for (const note of notes) {
        delete note.note_id; // we must remove these IDs to create new notes in a new clip
      }
      // Add notes to destination clip
      destClip.call("add_new_notes", { notes });
    }
  }
}

/**
 * Duplicates an object based on its type
 * @param {Object} args - The parameters
 * @param {string} args.type - Type of object to duplicate ("track", "scene", or "clip")
 * @param {string} args.id - ID of the object to duplicate
 * @param {number} [args.count=1] - Number of duplicates to create
 * @param {string} [args.destination] - Destination for clip duplication ("session" or "arranger"), required when type is "clip"
 * @param {number} [args.arrangerStartTime] - Start time in bar:beat format for Arranger view clips (uses song time signature)
 * @param {string} [args.arrangerLength] - Duration in bar|beat format (0-indexed beats). E.g., '4|0' = exactly 4 bars, '2|2' = 2 bars + 2 beats. For range "bars X to Y": use (Y-X)|0. Auto-duplicates looping clips to fill.
 * @param {string} [args.name] - Optional name for the duplicated object(s)
 * @param {boolean} [args.includeClips] - Whether to include clips when duplicating tracks or scenes
 * @returns {Object|Array<Object>} Result object(s) with information about the duplicated object(s)
 */
export function duplicate({
  type,
  id,
  count = 1,
  destination,
  arrangerStartTime,
  arrangerLength,
  name,
  includeClips,
} = {}) {
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
        const sceneIndex = object.sceneIndex;
        if (sceneIndex == null) {
          throw new Error(`duplicate failed: no scene index for id "${id}" (path="${object.path}")`);
        }

        // For multiple scenes, place them sequentially to avoid overlap
        const sceneLength = calculateSceneLength(sceneIndex);
        const actualArrangerStartBeats = baseArrangerStartBeats + i * sceneLength;
        newObjectMetadata = duplicateSceneToArranger(
          id,
          actualArrangerStartBeats,
          objectName,
          includeClips,
          arrangerLength,
          songTimeSigNumerator,
          songTimeSigDenominator
        );
      } else if (type === "clip") {
        // For multiple clips, place them sequentially to avoid overlap
        const clipLength = object.getProperty("length");
        const actualArrangerStartBeats = baseArrangerStartBeats + i * clipLength;
        newObjectMetadata = duplicateClipToArranger(
          id,
          actualArrangerStartBeats,
          objectName,
          arrangerLength,
          songTimeSigNumerator,
          songTimeSigDenominator
        );
      }
    } else {
      // Session view operations (no bar:beat conversion needed)
      if (type === "track") {
        const trackIndex = object.trackIndex;
        if (trackIndex == null) {
          throw new Error(`duplicate failed: no track index for id "${id}" (path="${object.path}")`);
        }
        // For multiple tracks, we need to account for previously created tracks
        const actualTrackIndex = trackIndex + i;
        newObjectMetadata = duplicateTrack(actualTrackIndex, objectName, includeClips);
      } else if (type === "scene") {
        const sceneIndex = object.sceneIndex;
        if (sceneIndex == null) {
          throw new Error(`duplicate failed: no scene index for id "${id}" (path="${object.path}")`);
        }
        const actualSceneIndex = sceneIndex + i;
        newObjectMetadata = duplicateScene(actualSceneIndex, objectName, includeClips);
      } else if (type === "clip") {
        const trackIndex = object.trackIndex;
        const clipSlotIndex = object.clipSlotIndex;
        if (trackIndex == null || clipSlotIndex == null) {
          throw new Error(`duplicate failed: no track or clip slot index for clip id "${id}" (path="${object.path}")`);
        }

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
  if (arrangerLength != null) result.arrangerLength = arrangerLength;
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
    const trackIndex = clip.trackIndex;
    if (trackIndex == null) {
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
    const trackIndex = clip.trackIndex;
    const clipSlotIndex = clip.clipSlotIndex;

    if (trackIndex == null || clipSlotIndex == null) {
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

function duplicateSceneToArranger(
  sceneId,
  arrangerStartTimeBeats,
  name,
  includeClips,
  arrangerLength,
  songTimeSigNumerator,
  songTimeSigDenominator
) {
  const scene = LiveAPI.from(sceneId);

  if (!scene.exists()) {
    throw new Error(`duplicate failed: scene with id "${sceneId}" does not exist`);
  }

  const sceneIndex = scene.sceneIndex;
  if (sceneIndex == null) {
    throw new Error(`duplicate failed: no scene index for id "${sceneId}" (path="${scene.path}")`);
  }

  const liveSet = new LiveAPI("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  const duplicatedClips = [];

  if (includeClips !== false) {
    // Determine the length to use for all clips
    let arrangerLengthBeats;
    if (arrangerLength != null) {
      arrangerLengthBeats = parseArrangerLength(arrangerLength, songTimeSigNumerator, songTimeSigDenominator);
    } else {
      // Default to the length of the longest clip in the scene
      arrangerLengthBeats = calculateSceneLength(sceneIndex);
    }

    // Only duplicate clips if includeClips is not explicitly false
    // Find all clips in this scene and duplicate them to arranger
    for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
      const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${sceneIndex}`);

      if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
        const clip = new LiveAPI(`${clipSlot.path} clip`);
        const track = new LiveAPI(`live_set tracks ${trackIndex}`);

        // Use the new length-aware clip creation logic
        const clipsForTrack = createClipsForLength(clip, track, arrangerStartTimeBeats, arrangerLengthBeats, name);

        // Add the scene name to each clip result if provided
        if (name != null) {
          for (const clipInfo of clipsForTrack) {
            clipInfo.name = name;
          }
        }

        duplicatedClips.push(...clipsForTrack);
      }
    }
  }

  const appView = new LiveAPI("live_app view");
  appView.call("show_view", "Arranger");

  const result = {
    arrangerStartTime: abletonBeatsToBarBeat(arrangerStartTimeBeats, songTimeSigNumerator, songTimeSigDenominator),
    duplicatedClips,
  };

  if (name != null) result.name = name;
  if (arrangerLength != null) result.arrangerLength = arrangerLength;
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

function duplicateClipToArranger(
  clipId,
  arrangerStartTimeBeats,
  name,
  arrangerLength,
  songTimeSigNumerator,
  songTimeSigDenominator
) {
  // Support "id {id}" (such as returned by childIds()) and id values directly
  const clip = LiveAPI.from(clipId);

  if (!clip.exists()) {
    throw new Error(`duplicate failed: no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = clip.trackIndex;
  if (trackIndex == null) {
    throw new Error(`duplicate failed: no track index for clipId "${clipId}" (path=${clip.path})`);
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const duplicatedClips = [];

  if (arrangerLength != null) {
    // Use the clip's time signature for duration calculation
    const clipTimeSigNumerator = clip.getProperty("signature_numerator");
    const clipTimeSigDenominator = clip.getProperty("signature_denominator");
    const arrangerLengthBeats = parseArrangerLength(arrangerLength, clipTimeSigNumerator, clipTimeSigDenominator);
    const clipsCreated = createClipsForLength(clip, track, arrangerStartTimeBeats, arrangerLengthBeats, name);
    duplicatedClips.push(...clipsCreated);
  } else {
    // No length specified - use original behavior
    const newClipResult = track.call("duplicate_clip_to_arrangement", `id ${clip.id}`, arrangerStartTimeBeats);
    const newClip = LiveAPI.from(newClipResult);

    newClip.setAll({
      name: name,
    });

    duplicatedClips.push(getMinimalClipInfo(newClip));
  }

  const appView = new LiveAPI("live_app view");
  appView.call("show_view", "Arranger");

  const result = {
    arrangerStartTime: abletonBeatsToBarBeat(arrangerStartTimeBeats, songTimeSigNumerator, songTimeSigDenominator),
    duplicatedClip: duplicatedClips.length === 1 ? duplicatedClips[0] : duplicatedClips,
  };

  if (name != null) result.name = name;
  if (arrangerLength != null) result.arrangerLength = arrangerLength;
  return result;
}
